import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { Readable } from 'node:stream';
import { TokenEncryptionService } from '../common/token-encryption.service';
import { UsersService } from '../users/users.service';

// Deliberately not imported from the separate `google-auth-library`
// package — pnpm can resolve a different copy of it than the one
// `googleapis` bundles internally, and TypeScript then treats their
// OAuth2Client classes as structurally distinct (private field branding),
// even though they're the same class at runtime. Deriving the type from
// `googleapis`' own `google.auth.OAuth2` sidesteps the whole problem.
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const APP_FOLDER_NAME = 'BewerbungsHub CVs';

// Thrown when Google reports the file itself is gone — e.g. the user
// deleted it directly in Drive, outside the app. Distinct from every
// other failure mode (auth, network, quota) so CvsService can react to
// this one specifically (mark the CV "unattached") instead of surfacing
// a generic error.
export class GoogleDriveFileNotFoundError extends Error {
  constructor(driveFileId: string) {
    super(`Google Drive file not found: ${driveFileId}`);
  }
}

function isNotFoundError(err: unknown): boolean {
  const code = (err as { code?: number; response?: { status?: number } })?.code;
  const status = (err as { response?: { status?: number } })?.response?.status;
  return code === 404 || status === 404;
}

@Injectable()
export class GoogleDriveService {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly tokenEncryption: TokenEncryptionService,
  ) {}

  buildAuthUrl(state: string): string {
    const client = this.buildOAuth2Client();
    return client.generateAuthUrl({
      // 'offline' + 'consent' together guarantee a refresh_token comes
      // back even on a reconnect — without 'prompt: consent', Google only
      // issues one the very first time a user ever grants this app access.
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_SCOPE],
      state,
    });
  }

  // Exchanges the OAuth code, creates the user's dedicated Drive folder
  // (first connect only), and persists the encrypted connection — the one
  // call the callback route needs.
  async completeConnection(userId: string, code: string): Promise<void> {
    const client = this.buildOAuth2Client();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      // Missing refresh_token here almost always means the consent screen
      // was shown without access_type=offline/prompt=consent (e.g. a
      // stale cached authorization) — surfacing this distinctly beats a
      // silent partial connection that can never refresh.
      throw new BadRequestException(
        'Google did not grant offline access — please try connecting again',
      );
    }
    client.setCredentials(tokens);

    const folderId = await this.createAppFolder(client);

    await this.usersService.setGoogleDriveConnection(userId, {
      accessTokenEncrypted: this.tokenEncryption.encrypt(tokens.access_token),
      refreshTokenEncrypted: this.tokenEncryption.encrypt(tokens.refresh_token),
      accessTokenExpiresAt: new Date(tokens.expiry_date),
      folderId,
    });
  }

  async isConnected(userId: string): Promise<boolean> {
    const user = await this.usersService.findById(userId);
    return !!user?.googleDrive;
  }

  async getConnectedAt(userId: string): Promise<Date | undefined> {
    const user = await this.usersService.findById(userId);
    return user?.googleDrive?.connectedAt;
  }

  async uploadFile(
    userId: string,
    buffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<{ driveFileId: string }> {
    const { client, folderId } = await this.getAuthenticatedClient(userId);
    const drive = google.drive({ version: 'v3', auth: client });
    const result = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id',
    });
    if (!result.data.id) {
      throw new Error('Google Drive did not return a file id for the upload');
    }
    return { driveFileId: result.data.id };
  }

  async downloadFile(userId: string, driveFileId: string): Promise<Buffer> {
    const { client } = await this.getAuthenticatedClient(userId);
    const drive = google.drive({ version: 'v3', auth: client });
    try {
      const result = await drive.files.get(
        { fileId: driveFileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(result.data as ArrayBuffer);
    } catch (err) {
      if (isNotFoundError(err))
        throw new GoogleDriveFileNotFoundError(driveFileId);
      throw err;
    }
  }

  async deleteFile(userId: string, driveFileId: string): Promise<void> {
    const { client } = await this.getAuthenticatedClient(userId);
    const drive = google.drive({ version: 'v3', auth: client });
    try {
      await drive.files.delete({ fileId: driveFileId });
    } catch (err) {
      // Already gone (e.g. the user deleted it directly in Drive) is a
      // no-op, not a failure — the end state delete() exists to guarantee
      // ("this file is no longer under our control") is already true.
      if (!isNotFoundError(err)) throw err;
    }
  }

  async disconnect(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (user?.googleDrive) {
      // Best-effort — Drive-backed CVs already saved stay recorded (and
      // become unreadable through the app until reconnected, surfaced in
      // the UI) rather than being silently deleted here.
      const client = this.buildOAuth2Client();
      try {
        await client.revokeToken(
          this.tokenEncryption.decrypt(user.googleDrive.refreshTokenEncrypted),
        );
      } catch {
        // Token may already be invalid/expired on Google's side — clearing
        // our own record is what actually matters here.
      }
    }
    await this.usersService.clearGoogleDriveConnection(userId);
  }

  private buildOAuth2Client(): OAuth2Client {
    return new google.auth.OAuth2(
      this.config.get<string>('googleDrive.clientId'),
      this.config.get<string>('googleDrive.clientSecret'),
      this.config.get<string>('googleDrive.redirectUri'),
    );
  }

  private async getAuthenticatedClient(
    userId: string,
  ): Promise<{ client: OAuth2Client; folderId: string }> {
    const user = await this.usersService.findById(userId);
    if (!user?.googleDrive) {
      throw new BadRequestException(
        'Google Drive is not connected for this user',
      );
    }
    const {
      accessTokenEncrypted,
      refreshTokenEncrypted,
      accessTokenExpiresAt,
      folderId,
    } = user.googleDrive;

    const client = this.buildOAuth2Client();
    client.setCredentials({
      access_token: this.tokenEncryption.decrypt(accessTokenEncrypted),
      refresh_token: this.tokenEncryption.decrypt(refreshTokenEncrypted),
      expiry_date: accessTokenExpiresAt.getTime(),
    });

    // google-auth-library refreshes the access token transparently on the
    // next API call once it's near expiry, and emits this event with the
    // new one — without persisting it here, every single request from this
    // user would silently re-refresh from the same stale token instead of
    // reusing the still-valid one just issued.
    client.on('tokens', (tokens) => {
      if (tokens.access_token && tokens.expiry_date) {
        void this.usersService.updateGoogleDriveAccessToken(
          userId,
          this.tokenEncryption.encrypt(tokens.access_token),
          new Date(tokens.expiry_date),
        );
      }
    });

    return { client, folderId };
  }

  private async createAppFolder(client: OAuth2Client): Promise<string> {
    const drive = google.drive({ version: 'v3', auth: client });
    const result = await drive.files.create({
      requestBody: {
        name: APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });
    if (!result.data.id) {
      throw new Error('Google Drive did not return a folder id');
    }
    return result.data.id;
  }
}
