import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GmailService } from './gmail.service';
import { UsersService, GmailConnectionInput } from '../users/users.service';
import { TokenEncryptionService } from '../common/token-encryption.service';

type TokensEvent = { access_token?: string; expiry_date?: number };

const mockOAuth2Client = {
  generateAuthUrl: jest.fn<string, [unknown]>(),
  getToken: jest.fn<Promise<{ tokens: Record<string, unknown> }>, [string]>(),
  setCredentials: jest.fn<void, [unknown]>(),
  on: jest.fn<void, [string, (tokens: TokensEvent) => void]>(),
  revokeToken: jest.fn<Promise<unknown>, [string]>(),
};

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn(() => mockOAuth2Client) },
  },
}));

const TEST_KEY = '0123456789abcdef'.repeat(4).slice(0, 64);

function makeConfig(): ConfigService {
  const values: Record<string, string> = {
    'gmail.clientId': 'test-client-id',
    'gmail.clientSecret': 'test-client-secret',
    'gmail.redirectUri': 'https://example.com/gmail/callback',
    'security.tokenEncryptionKey': TEST_KEY,
  };
  return { get: (key: string) => values[key] } as ConfigService;
}

// See the identical comment in google-drive.service.spec.ts for why this
// is a plain object literal, not a `jest.Mocked<UsersService>` cast.
interface MockUser {
  gmail?: {
    accessTokenEncrypted?: string;
    refreshTokenEncrypted?: string;
    accessTokenExpiresAt?: Date;
    connectedAt?: Date;
    lastSyncedAt?: Date;
    needsReconnect?: boolean;
  };
}

function makeUsersService() {
  return {
    findById: jest.fn<Promise<MockUser | null>, [string]>(),
    setGmailConnection: jest.fn<
      Promise<unknown>,
      [string, GmailConnectionInput]
    >(),
    updateGmailAccessToken: jest.fn<Promise<unknown>, [string, string, Date]>(),
    clearGmailConnection: jest.fn<Promise<unknown>, [string]>(),
  };
}

describe('GmailService', () => {
  let usersService: ReturnType<typeof makeUsersService>;
  let tokenEncryption: TokenEncryptionService;
  let service: GmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersService = makeUsersService();
    tokenEncryption = new TokenEncryptionService(makeConfig());
    service = new GmailService(
      makeConfig(),
      usersService as unknown as UsersService,
      tokenEncryption,
    );
  });

  describe('buildAuthUrl', () => {
    it('requests offline access with the gmail.readonly scope and the given state (happy path)', () => {
      mockOAuth2Client.generateAuthUrl.mockReturnValue(
        'https://accounts.google.com/o/oauth2/v2/auth?...',
      );

      const url = service.buildAuthUrl('signed-state');

      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/gmail.readonly'],
        state: 'signed-state',
      });
      expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?...');
    });
  });

  describe('completeConnection', () => {
    it('exchanges the code and persists encrypted tokens (happy path)', async () => {
      mockOAuth2Client.getToken.mockResolvedValue({
        tokens: {
          access_token: 'raw-access-token',
          refresh_token: 'raw-refresh-token',
          expiry_date: 1_700_000_000_000,
        },
      });

      await service.completeConnection('user-1', 'auth-code');

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith('auth-code');
      expect(usersService.setGmailConnection).toHaveBeenCalledTimes(1);
      const [userId, connection] =
        usersService.setGmailConnection.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(tokenEncryption.decrypt(connection.accessTokenEncrypted)).toBe(
        'raw-access-token',
      );
      expect(tokenEncryption.decrypt(connection.refreshTokenEncrypted)).toBe(
        'raw-refresh-token',
      );
    });

    it('rejects when Google does not grant a refresh token (negative case)', async () => {
      mockOAuth2Client.getToken.mockResolvedValue({
        tokens: {
          access_token: 'raw-access-token',
          expiry_date: 1_700_000_000_000,
        },
      });

      await expect(
        service.completeConnection('user-1', 'auth-code'),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.setGmailConnection).not.toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('reports true when the user has a connection (happy path)', async () => {
      usersService.findById.mockResolvedValue({ gmail: {} });

      await expect(service.isConnected('user-1')).resolves.toBe(true);
    });

    it('reports false when the user has no connection (negative case)', async () => {
      usersService.findById.mockResolvedValue({});

      await expect(service.isConnected('user-1')).resolves.toBe(false);
    });
  });

  describe('getStatus', () => {
    it('returns connected/connectedAt/lastSyncedAt/needsReconnect from the stored connection (happy path)', async () => {
      const connectedAt = new Date('2026-01-01T00:00:00.000Z');
      const lastSyncedAt = new Date('2026-01-02T00:00:00.000Z');
      usersService.findById.mockResolvedValue({
        gmail: { connectedAt, lastSyncedAt, needsReconnect: false },
      });

      await expect(service.getStatus('user-1')).resolves.toEqual({
        connected: true,
        connectedAt,
        lastSyncedAt,
        needsReconnect: false,
      });
    });

    it('reports a disconnected, non-reconnect-needed status for a user with no connection (edge case)', async () => {
      usersService.findById.mockResolvedValue({});

      await expect(service.getStatus('user-1')).resolves.toEqual({
        connected: false,
        connectedAt: undefined,
        lastSyncedAt: undefined,
        needsReconnect: false,
      });
    });

    it('surfaces needsReconnect: true when the connection needs reconnecting (edge case)', async () => {
      usersService.findById.mockResolvedValue({
        gmail: { needsReconnect: true },
      });

      await expect(service.getStatus('user-1')).resolves.toMatchObject({
        needsReconnect: true,
      });
    });
  });

  describe('getAuthenticatedClient', () => {
    it('decrypts and sets credentials from the stored connection (happy path)', async () => {
      usersService.findById.mockResolvedValue({
        gmail: {
          accessTokenEncrypted: tokenEncryption.encrypt('access-token'),
          refreshTokenEncrypted: tokenEncryption.encrypt('refresh-token'),
          accessTokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
        },
      });

      await service.getAuthenticatedClient('user-1');

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expiry_date: new Date('2030-01-01T00:00:00.000Z').getTime(),
      });
    });

    it('rejects when Gmail is not connected for the user (negative case)', async () => {
      usersService.findById.mockResolvedValue({});

      await expect(service.getAuthenticatedClient('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('persists a rotated access token when the OAuth client refreshes it (edge case)', async () => {
      usersService.findById.mockResolvedValue({
        gmail: {
          accessTokenEncrypted: tokenEncryption.encrypt('access-token'),
          refreshTokenEncrypted: tokenEncryption.encrypt('refresh-token'),
          accessTokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
        },
      });

      await service.getAuthenticatedClient('user-1');

      expect(mockOAuth2Client.on).toHaveBeenCalledWith(
        'tokens',
        expect.any(Function),
      );
      const [, tokensHandler] = mockOAuth2Client.on.mock.calls[0];
      tokensHandler({
        access_token: 'new-access-token',
        expiry_date: 1_800_000_000_000,
      });

      expect(usersService.updateGmailAccessToken).toHaveBeenCalledTimes(1);
      const [userId, encryptedToken, expiresAt] =
        usersService.updateGmailAccessToken.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(tokenEncryption.decrypt(encryptedToken)).toBe('new-access-token');
      expect(expiresAt).toEqual(new Date(1_800_000_000_000));
    });
  });

  describe('disconnect', () => {
    it('revokes the refresh token and clears the connection (happy path)', async () => {
      const refreshTokenEncrypted = tokenEncryption.encrypt('refresh-token');
      usersService.findById.mockResolvedValue({
        gmail: { refreshTokenEncrypted },
      });
      mockOAuth2Client.revokeToken.mockResolvedValue({});

      await service.disconnect('user-1');

      expect(mockOAuth2Client.revokeToken).toHaveBeenCalledWith(
        'refresh-token',
      );
      expect(usersService.clearGmailConnection).toHaveBeenCalledWith('user-1');
    });

    it('still clears the connection when revoking fails (edge case)', async () => {
      const refreshTokenEncrypted = tokenEncryption.encrypt('refresh-token');
      usersService.findById.mockResolvedValue({
        gmail: { refreshTokenEncrypted },
      });
      mockOAuth2Client.revokeToken.mockRejectedValue(
        new Error('already revoked'),
      );

      await service.disconnect('user-1');

      expect(usersService.clearGmailConnection).toHaveBeenCalledWith('user-1');
    });

    it('clears without attempting a revoke when there is no connection (negative case)', async () => {
      usersService.findById.mockResolvedValue({});

      await service.disconnect('user-1');

      expect(mockOAuth2Client.revokeToken).not.toHaveBeenCalled();
      expect(usersService.clearGmailConnection).toHaveBeenCalledWith('user-1');
    });
  });
});
