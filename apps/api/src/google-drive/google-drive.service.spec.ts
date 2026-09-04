import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleDriveFileNotFoundError,
  GoogleDriveService,
} from './google-drive.service';
import {
  UsersService,
  GoogleDriveConnectionInput,
} from '../users/users.service';
import { TokenEncryptionService } from '../common/token-encryption.service';

type TokensEvent = { access_token?: string; expiry_date?: number };

const mockOAuth2Client = {
  generateAuthUrl: jest.fn<string, [unknown]>(),
  getToken: jest.fn<Promise<{ tokens: Record<string, unknown> }>, [string]>(),
  setCredentials: jest.fn<void, [unknown]>(),
  on: jest.fn<void, [string, (tokens: TokensEvent) => void]>(),
  revokeToken: jest.fn<Promise<unknown>, [string]>(),
};

const mockFilesCreate = jest.fn<
  Promise<{ data: { id?: string } }>,
  unknown[]
>();
const mockFilesGet = jest.fn<Promise<{ data: unknown }>, unknown[]>();
const mockFilesDelete = jest.fn<Promise<Record<string, never>>, unknown[]>();

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn(() => mockOAuth2Client) },
    drive: jest.fn(() => ({
      files: {
        create: (...args: unknown[]) => mockFilesCreate(...args),
        get: (...args: unknown[]) => mockFilesGet(...args),
        delete: (...args: unknown[]) => mockFilesDelete(...args),
      },
    })),
  },
}));

const TEST_KEY = '0123456789abcdef'.repeat(4).slice(0, 64);

function makeConfig(): ConfigService {
  const values: Record<string, string> = {
    'googleDrive.clientId': 'test-client-id',
    'googleDrive.clientSecret': 'test-client-secret',
    'googleDrive.redirectUri': 'https://example.com/callback',
    'security.tokenEncryptionKey': TEST_KEY,
  };
  return { get: (key: string) => values[key] } as ConfigService;
}

// Everything GoogleDriveService reads off a `findById` result — not the
// full Mongoose UserDocument shape, just what's actually used. All
// sub-fields optional: individual tests only ever populate the ones the
// method under test actually reads.
interface MockUser {
  googleDrive?: {
    accessTokenEncrypted?: string;
    refreshTokenEncrypted?: string;
    accessTokenExpiresAt?: Date;
    folderId?: string;
    connectedAt?: Date;
  };
}

// A plain object literal, not a `jest.Mocked<UsersService>` cast — the
// latter makes ESLint's unbound-method rule treat every
// `expect(usersService.someMethod)` below as an unsafely-detached class
// method reference. A plain object's function properties don't trigger
// that (same pattern already used in applications.controller.spec.ts).
// Each mock is generically typed to the real method's signature so the
// rest of the file gets real types back, not `any`.
function makeUsersService() {
  return {
    findById: jest.fn<Promise<MockUser | null>, [string]>(),
    setGoogleDriveConnection: jest.fn<
      Promise<unknown>,
      [string, GoogleDriveConnectionInput]
    >(),
    updateGoogleDriveAccessToken: jest.fn<
      Promise<unknown>,
      [string, string, Date]
    >(),
    clearGoogleDriveConnection: jest.fn<Promise<unknown>, [string]>(),
  };
}

describe('GoogleDriveService', () => {
  let usersService: ReturnType<typeof makeUsersService>;
  let tokenEncryption: TokenEncryptionService;
  let service: GoogleDriveService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersService = makeUsersService();
    tokenEncryption = new TokenEncryptionService(makeConfig());
    service = new GoogleDriveService(
      makeConfig(),
      usersService as unknown as UsersService,
      tokenEncryption,
    );
  });

  describe('buildAuthUrl', () => {
    it('requests offline access with the drive.file scope and the given state (happy path)', () => {
      mockOAuth2Client.generateAuthUrl.mockReturnValue(
        'https://accounts.google.com/o/oauth2/v2/auth?...',
      );

      const url = service.buildAuthUrl('signed-state');

      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/drive.file'],
        state: 'signed-state',
      });
      expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?...');
    });
  });

  describe('completeConnection', () => {
    it('exchanges the code, creates the app folder, and persists encrypted tokens (happy path)', async () => {
      mockOAuth2Client.getToken.mockResolvedValue({
        tokens: {
          access_token: 'raw-access-token',
          refresh_token: 'raw-refresh-token',
          expiry_date: 1_700_000_000_000,
        },
      });
      mockFilesCreate.mockResolvedValue({ data: { id: 'folder-123' } });

      await service.completeConnection('user-1', 'auth-code');

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith('auth-code');
      const [createArgs] = mockFilesCreate.mock.calls[0];
      expect(createArgs).toMatchObject({
        requestBody: {
          name: 'BewerbungsHub CVs',
          mimeType: 'application/vnd.google-apps.folder',
        },
      });
      expect(usersService.setGoogleDriveConnection).toHaveBeenCalledTimes(1);
      const [userId, connection] =
        usersService.setGoogleDriveConnection.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(connection.folderId).toBe('folder-123');
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
      expect(usersService.setGoogleDriveConnection).not.toHaveBeenCalled();
    });
  });

  describe('isConnected / getConnectedAt', () => {
    it('reports connected with the stored connectedAt when the user has a connection (happy path)', async () => {
      const connectedAt = new Date('2026-01-01T00:00:00.000Z');
      usersService.findById.mockResolvedValue({
        googleDrive: { connectedAt },
      });

      await expect(service.isConnected('user-1')).resolves.toBe(true);
      await expect(service.getConnectedAt('user-1')).resolves.toBe(connectedAt);
    });

    it('reports not connected when the user has no connection (negative case)', async () => {
      usersService.findById.mockResolvedValue({});

      await expect(service.isConnected('user-1')).resolves.toBe(false);
      await expect(service.getConnectedAt('user-1')).resolves.toBeUndefined();
    });
  });

  describe('uploadFile / downloadFile / deleteFile', () => {
    function mockConnectedUser() {
      usersService.findById.mockResolvedValue({
        googleDrive: {
          accessTokenEncrypted: tokenEncryption.encrypt('access-token'),
          refreshTokenEncrypted: tokenEncryption.encrypt('refresh-token'),
          accessTokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
          folderId: 'folder-123',
        },
      });
    }

    it('uploads into the user Drive folder and returns the new file id (happy path)', async () => {
      mockConnectedUser();
      mockFilesCreate.mockResolvedValue({ data: { id: 'file-abc' } });

      const result = await service.uploadFile(
        'user-1',
        Buffer.from('pdf-bytes'),
        'resume.pdf',
        'application/pdf',
      );

      expect(result).toEqual({ driveFileId: 'file-abc' });
      const [uploadArgs] = mockFilesCreate.mock.calls[0];
      expect(uploadArgs).toMatchObject({
        requestBody: { name: 'resume.pdf', parents: ['folder-123'] },
      });
    });

    it('rejects an upload when Drive is not connected (negative case)', async () => {
      usersService.findById.mockResolvedValue({});

      await expect(
        service.uploadFile(
          'user-1',
          Buffer.from('x'),
          'resume.pdf',
          'application/pdf',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('downloads file bytes as a Buffer (happy path)', async () => {
      mockConnectedUser();
      const bytes = new TextEncoder().encode('pdf-content').buffer;
      mockFilesGet.mockResolvedValue({ data: bytes });

      const result = await service.downloadFile('user-1', 'file-abc');

      expect(mockFilesGet).toHaveBeenCalledWith(
        { fileId: 'file-abc', alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('pdf-content');
    });

    it('deletes the file by id (happy path)', async () => {
      mockConnectedUser();
      mockFilesDelete.mockResolvedValue({});

      await service.deleteFile('user-1', 'file-abc');

      expect(mockFilesDelete).toHaveBeenCalledWith({ fileId: 'file-abc' });
    });

    it('throws GoogleDriveFileNotFoundError when the file is already gone on download (edge case)', async () => {
      mockConnectedUser();
      mockFilesGet.mockRejectedValue({ code: 404 });

      await expect(service.downloadFile('user-1', 'file-abc')).rejects.toThrow(
        GoogleDriveFileNotFoundError,
      );
    });

    it('re-throws an unrelated download error as-is (negative case)', async () => {
      mockConnectedUser();
      mockFilesGet.mockRejectedValue({ code: 500 });

      await expect(
        service.downloadFile('user-1', 'file-abc'),
      ).rejects.not.toThrow(GoogleDriveFileNotFoundError);
    });

    it('treats deleting an already-gone file as success, not a failure (edge case)', async () => {
      mockConnectedUser();
      mockFilesDelete.mockRejectedValue({ code: 404 });

      await expect(
        service.deleteFile('user-1', 'file-abc'),
      ).resolves.toBeUndefined();
    });

    it('re-throws an unrelated delete error (negative case)', async () => {
      mockConnectedUser();
      mockFilesDelete.mockRejectedValue({ code: 500 });

      await expect(service.deleteFile('user-1', 'file-abc')).rejects.toEqual({
        code: 500,
      });
    });

    it('persists a rotated access token when the OAuth client refreshes it (edge case)', async () => {
      mockConnectedUser();
      mockFilesDelete.mockResolvedValue({});

      await service.deleteFile('user-1', 'file-abc');

      expect(mockOAuth2Client.on).toHaveBeenCalledWith(
        'tokens',
        expect.any(Function),
      );
      const [, tokensHandler] = mockOAuth2Client.on.mock.calls[0];
      tokensHandler({
        access_token: 'new-access-token',
        expiry_date: 1_800_000_000_000,
      });

      expect(usersService.updateGoogleDriveAccessToken).toHaveBeenCalledTimes(
        1,
      );
      const [userId, encryptedToken, expiresAt] =
        usersService.updateGoogleDriveAccessToken.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(tokenEncryption.decrypt(encryptedToken)).toBe('new-access-token');
      expect(expiresAt).toEqual(new Date(1_800_000_000_000));
    });
  });

  describe('disconnect', () => {
    it('revokes the refresh token and clears the connection (happy path)', async () => {
      const refreshTokenEncrypted = tokenEncryption.encrypt('refresh-token');
      usersService.findById.mockResolvedValue({
        googleDrive: { refreshTokenEncrypted },
      });
      mockOAuth2Client.revokeToken.mockResolvedValue({});

      await service.disconnect('user-1');

      expect(mockOAuth2Client.revokeToken).toHaveBeenCalledWith(
        'refresh-token',
      );
      expect(usersService.clearGoogleDriveConnection).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('still clears the connection when revoking fails (edge case)', async () => {
      const refreshTokenEncrypted = tokenEncryption.encrypt('refresh-token');
      usersService.findById.mockResolvedValue({
        googleDrive: { refreshTokenEncrypted },
      });
      mockOAuth2Client.revokeToken.mockRejectedValue(
        new Error('already revoked'),
      );

      await service.disconnect('user-1');

      expect(usersService.clearGoogleDriveConnection).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('clears without attempting a revoke when there is no connection (negative case)', async () => {
      usersService.findById.mockResolvedValue({});

      await service.disconnect('user-1');

      expect(mockOAuth2Client.revokeToken).not.toHaveBeenCalled();
      expect(usersService.clearGoogleDriveConnection).toHaveBeenCalledWith(
        'user-1',
      );
    });
  });
});
