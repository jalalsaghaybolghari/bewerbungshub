import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import type { GmailStatus } from '@bewerber/shared';
import { TokenEncryptionService } from '../common/token-encryption.service';
import { UsersService } from '../users/users.service';

// See the identical comment on GoogleDriveService — deriving the type from
// `googleapis`' own `google.auth.OAuth2` sidesteps a structural-typing
// mismatch between it and the separate `google-auth-library` package.
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

@Injectable()
export class GmailService {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly tokenEncryption: TokenEncryptionService,
  ) {}

  buildAuthUrl(state: string): string {
    const client = this.buildOAuth2Client();
    return client.generateAuthUrl({
      // 'offline' + 'consent' together guarantee a refresh_token comes
      // back even on a reconnect — same reasoning as Drive's connect flow.
      access_type: 'offline',
      prompt: 'consent',
      scope: [GMAIL_SCOPE],
      state,
    });
  }

  // Exchanges the OAuth code and persists the encrypted connection —
  // nextSyncAt is set to "now" inside setGmailConnection, which is what
  // kicks off this user's first (backfill) sync on the dispatcher's very
  // next tick, no separate trigger needed.
  async completeConnection(userId: string, code: string): Promise<void> {
    const client = this.buildOAuth2Client();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      throw new BadRequestException(
        'Google did not grant offline access — please try connecting again',
      );
    }

    await this.usersService.setGmailConnection(userId, {
      accessTokenEncrypted: this.tokenEncryption.encrypt(tokens.access_token),
      refreshTokenEncrypted: this.tokenEncryption.encrypt(tokens.refresh_token),
      accessTokenExpiresAt: new Date(tokens.expiry_date),
    });
  }

  async isConnected(userId: string): Promise<boolean> {
    const user = await this.usersService.findById(userId);
    return !!user?.gmail;
  }

  async getStatus(userId: string): Promise<GmailStatus> {
    const user = await this.usersService.findById(userId);
    return {
      connected: !!user?.gmail,
      connectedAt: user?.gmail?.connectedAt,
      lastSyncedAt: user?.gmail?.lastSyncedAt,
      needsReconnect: user?.gmail?.needsReconnect ?? false,
    };
  }

  async disconnect(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (user?.gmail) {
      const client = this.buildOAuth2Client();
      try {
        await client.revokeToken(
          this.tokenEncryption.decrypt(user.gmail.refreshTokenEncrypted),
        );
      } catch {
        // Token may already be invalid/expired on Google's side — clearing
        // our own record is what actually matters here.
      }
    }
    await this.usersService.clearGmailConnection(userId);
  }

  // Public (unlike Drive's private equivalent) — GmailSyncService is a
  // separate class that needs an authenticated client to actually read
  // the mailbox, rather than every Gmail API call living on this service
  // the way every Drive API call lives on GoogleDriveService.
  async getAuthenticatedClient(userId: string): Promise<OAuth2Client> {
    const user = await this.usersService.findById(userId);
    if (!user?.gmail) {
      throw new BadRequestException('Gmail is not connected for this user');
    }
    const {
      accessTokenEncrypted,
      refreshTokenEncrypted,
      accessTokenExpiresAt,
    } = user.gmail;

    const client = this.buildOAuth2Client();
    client.setCredentials({
      access_token: this.tokenEncryption.decrypt(accessTokenEncrypted),
      refresh_token: this.tokenEncryption.decrypt(refreshTokenEncrypted),
      expiry_date: accessTokenExpiresAt.getTime(),
    });

    // Same transparent-refresh persistence Drive already does — without
    // this, every sync would silently re-refresh from the same stale
    // token instead of reusing the one just issued.
    client.on('tokens', (tokens) => {
      if (tokens.access_token && tokens.expiry_date) {
        void this.usersService.updateGmailAccessToken(
          userId,
          this.tokenEncryption.encrypt(tokens.access_token),
          new Date(tokens.expiry_date),
        );
      }
    });

    return client;
  }

  private buildOAuth2Client(): OAuth2Client {
    return new google.auth.OAuth2(
      this.config.get<string>('gmail.clientId'),
      this.config.get<string>('gmail.clientSecret'),
      this.config.get<string>('gmail.redirectUri'),
    );
  }
}
