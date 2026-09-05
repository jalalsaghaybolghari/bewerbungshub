import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { UserDocument } from '../users/schemas/user.schema';
import { SystemSettingsService } from '../system-settings/system-settings.service';

function makeUser(overrides: Partial<UserDocument> = {}): UserDocument {
  return {
    id: 'user-1',
    _id: 'user-1',
    email: 'alice@example.com',
    passwordHash: 'irrelevant',
    displayName: 'Alice',
    locale: 'en',
    emailVerified: false,
    emailVerificationAttempts: 0,
    isLocked: false,
    approvalStatus: 'approved',
    ...overrides,
  } as unknown as UserDocument;
}

function makeUsersService() {
  return {
    findByEmail: jest.fn<Promise<UserDocument | null>, [string]>(),
    findById: jest.fn<Promise<UserDocument | null>, [string]>(),
    create: jest.fn<Promise<UserDocument>, [unknown]>(),
    setRefreshTokenHash: jest.fn<
      Promise<unknown>,
      [string, string | undefined]
    >(),
    setEmailVerificationCode: jest.fn<
      Promise<unknown>,
      [string, string, Date]
    >(),
    incrementEmailVerificationAttempts: jest.fn<Promise<unknown>, [string]>(),
    markEmailVerified: jest.fn<Promise<unknown>, [string]>(),
    invalidateEmailVerificationCode: jest.fn<Promise<unknown>, [string]>(),
    setApiKeyHash: jest.fn<Promise<unknown>, [string, string]>(),
    clearApiKeyHash: jest.fn<Promise<unknown>, [string]>(),
    findByApiKeyHash: jest.fn<Promise<UserDocument | null>, [string]>(),
    setApprovalStatus: jest.fn<Promise<unknown>, [string, string]>(),
    setLocked: jest.fn<Promise<unknown>, [string, boolean]>(),
  };
}

function makeMailService() {
  return {
    sendVerificationCode: jest.fn<Promise<void>, [string, string]>(),
  };
}

function makeJwtService() {
  return {
    signAsync: jest
      .fn<Promise<string>, [unknown, unknown?]>()
      .mockResolvedValue('signed-token'),
    verifyAsync: jest.fn(),
  };
}

function makeConfigService() {
  return { get: jest.fn().mockReturnValue('config-value') };
}

function makeSystemSettingsService() {
  return {
    getAutoApprove: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    setAutoApprove: jest.fn<Promise<void>, [boolean]>(),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let usersService: ReturnType<typeof makeUsersService>;
  let mailService: ReturnType<typeof makeMailService>;
  let systemSettingsService: ReturnType<typeof makeSystemSettingsService>;
  let jwtService: ReturnType<typeof makeJwtService>;

  beforeEach(() => {
    usersService = makeUsersService();
    mailService = makeMailService();
    systemSettingsService = makeSystemSettingsService();
    jwtService = makeJwtService();
    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService as never,
      makeConfigService() as never,
      mailService as unknown as MailService,
      systemSettingsService as unknown as SystemSettingsService,
    );
  });

  describe('register', () => {
    it('creates the user, sends a code, and returns verification_sent when auto-approve is on (happy path)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const created = makeUser();
      usersService.create.mockResolvedValue(created);

      const result = await service.register({
        email: 'alice@example.com',
        password: 'a very strong password',
        displayName: 'Alice',
      });

      expect(result).toEqual({
        email: 'alice@example.com',
        status: 'verification_sent',
      });
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ approvalStatus: 'approved' }),
      );
      expect(usersService.setEmailVerificationCode).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        expect.any(Date),
      );
      expect(mailService.sendVerificationCode).toHaveBeenCalledWith(
        'alice@example.com',
        expect.stringMatching(/^\d{6}$/),
      );
      expect(usersService.setRefreshTokenHash).not.toHaveBeenCalled();
    });

    it('creates a pending user and sends no code when auto-approve is off (edge case)', async () => {
      systemSettingsService.getAutoApprove.mockResolvedValue(false);
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(
        makeUser({ approvalStatus: 'pending' }),
      );

      const result = await service.register({
        email: 'alice@example.com',
        password: 'a very strong password',
        displayName: 'Alice',
      });

      expect(result).toEqual({
        email: 'alice@example.com',
        status: 'pending_approval',
      });
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ approvalStatus: 'pending' }),
      );
      expect(mailService.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('rejects a duplicate email without sending a code (negative case)', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());

      await expect(
        service.register({
          email: 'alice@example.com',
          password: 'a very strong password',
          displayName: 'Alice',
        }),
      ).rejects.toThrow(ConflictException);
      expect(mailService.sendVerificationCode).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('rejects an unverified account with the EMAIL_NOT_VERIFIED shape, even with the correct password (negative case)', async () => {
      const passwordHash = await argon2.hash('correct password');
      usersService.findByEmail.mockResolvedValue(
        makeUser({ passwordHash, emailVerified: false }),
      );

      const error: ForbiddenException = await service
        .login({ email: 'alice@example.com', password: 'correct password' })
        .catch((err: ForbiddenException) => err);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
        email: 'alice@example.com',
      });
    });

    it('logs in a verified account with the correct password (happy path)', async () => {
      const passwordHash = await argon2.hash('correct password');
      usersService.findByEmail.mockResolvedValue(
        makeUser({ passwordHash, emailVerified: true }),
      );

      const result = await service.login({
        email: 'alice@example.com',
        password: 'correct password',
      });

      expect(result.user.email).toBe('alice@example.com');
      expect(result.tokens.accessToken).toBe('signed-token');
    });

    it('rejects a locked account with the ACCOUNT_LOCKED shape, even with the correct password (negative case)', async () => {
      const passwordHash = await argon2.hash('correct password');
      usersService.findByEmail.mockResolvedValue(
        makeUser({ passwordHash, emailVerified: true, isLocked: true }),
      );

      const error: ForbiddenException = await service
        .login({ email: 'alice@example.com', password: 'correct password' })
        .catch((err: ForbiddenException) => err);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    });

    it('reports ACCOUNT_LOCKED (not EMAIL_NOT_VERIFIED) when a locked account is also unverified (edge case)', async () => {
      const passwordHash = await argon2.hash('correct password');
      usersService.findByEmail.mockResolvedValue(
        makeUser({ passwordHash, emailVerified: false, isLocked: true }),
      );

      const error: ForbiddenException = await service
        .login({ email: 'alice@example.com', password: 'correct password' })
        .catch((err: ForbiddenException) => err);

      expect(error.getResponse()).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    });
  });

  describe('refresh', () => {
    it('rejects a locked user and clears their refresh hash (negative case)', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      usersService.findById.mockResolvedValue(
        makeUser({ isLocked: true, refreshTokenHash: 'irrelevant' }),
      );

      await expect(service.refresh('some-refresh-token')).rejects.toThrow(
        'Refresh token no longer valid',
      );
      expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
        'user-1',
        undefined,
      );
    });

    it('rejects when no refresh token is provided (negative case)', async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(
        'Missing refresh token',
      );
    });
  });

  describe('confirmEmail', () => {
    it('verifies the account and issues tokens on a correct code (happy path)', async () => {
      const codeHash = await argon2.hash('123456');
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          emailVerified: false,
          emailVerificationCodeHash: codeHash,
          emailVerificationCodeExpiresAt: new Date(Date.now() + 60_000),
          emailVerificationAttempts: 0,
        }),
      );

      const result = await service.confirmEmail({
        email: 'alice@example.com',
        code: '123456',
      });

      expect(usersService.markEmailVerified).toHaveBeenCalledWith('user-1');
      expect(result.tokens.accessToken).toBe('signed-token');
    });

    it('increments attempts and does not verify on a wrong code (negative case)', async () => {
      const codeHash = await argon2.hash('123456');
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          emailVerified: false,
          emailVerificationCodeHash: codeHash,
          emailVerificationCodeExpiresAt: new Date(Date.now() + 60_000),
          emailVerificationAttempts: 0,
        }),
      );

      await expect(
        service.confirmEmail({ email: 'alice@example.com', code: '000000' }),
      ).rejects.toThrow(BadRequestException);
      expect(
        usersService.incrementEmailVerificationAttempts,
      ).toHaveBeenCalledWith('user-1');
      expect(usersService.markEmailVerified).not.toHaveBeenCalled();
    });

    it('rejects and clears an expired code (edge case)', async () => {
      const codeHash = await argon2.hash('123456');
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          emailVerified: false,
          emailVerificationCodeHash: codeHash,
          emailVerificationCodeExpiresAt: new Date(Date.now() - 1000),
          emailVerificationAttempts: 0,
        }),
      );

      await expect(
        service.confirmEmail({ email: 'alice@example.com', code: '123456' }),
      ).rejects.toThrow('Code expired — request a new one');
      expect(usersService.invalidateEmailVerificationCode).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('rejects and clears the code once attempts are exhausted (edge case)', async () => {
      const codeHash = await argon2.hash('123456');
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          emailVerified: false,
          emailVerificationCodeHash: codeHash,
          emailVerificationCodeExpiresAt: new Date(Date.now() + 60_000),
          emailVerificationAttempts: 5,
        }),
      );

      await expect(
        service.confirmEmail({ email: 'alice@example.com', code: '123456' }),
      ).rejects.toThrow('Too many incorrect attempts — request a new one');
      expect(usersService.invalidateEmailVerificationCode).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('rejects confirming an already-verified account (negative case)', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );

      await expect(
        service.confirmEmail({ email: 'alice@example.com', code: '123456' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when there is no account with that email (negative case)', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.confirmEmail({ email: 'nobody@example.com', code: '123456' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resendCode', () => {
    it('sends a fresh code after the cooldown has passed (happy path)', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          emailVerified: false,
          emailVerificationLastSentAt: new Date(Date.now() - 120_000),
        }),
      );

      await service.resendCode({ email: 'alice@example.com' });

      expect(mailService.sendVerificationCode).toHaveBeenCalledTimes(1);
    });

    it('rejects a resend within the 60s cooldown (negative case)', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          emailVerified: false,
          emailVerificationLastSentAt: new Date(Date.now() - 5000),
        }),
      );

      await expect(
        service.resendCode({ email: 'alice@example.com' }),
      ).rejects.toThrow(HttpException);
      expect(mailService.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('rejects resending for an already-verified account (negative case)', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );

      await expect(
        service.resendCode({ email: 'alice@example.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('generateApiKey', () => {
    it('returns a prefixed raw key exactly once and stores only its hash (happy path)', async () => {
      const result = await service.generateApiKey('user-1');

      expect(result.apiKey).toMatch(/^bwh_[0-9a-f]{64}$/);
      expect(usersService.setApiKeyHash).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
      );
      const [, storedHash] = usersService.setApiKeyHash.mock.calls[0];
      expect(storedHash).not.toBe(result.apiKey);
    });

    it('generates a different key each call, replacing any prior one (edge case)', async () => {
      const first = await service.generateApiKey('user-1');
      const second = await service.generateApiKey('user-1');

      expect(first.apiKey).not.toBe(second.apiKey);
      expect(usersService.setApiKeyHash).toHaveBeenCalledTimes(2);
    });
  });

  describe('revokeApiKey', () => {
    it('clears the stored key hash (happy path)', async () => {
      await service.revokeApiKey('user-1');

      expect(usersService.clearApiKeyHash).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getApiKeyStatus', () => {
    it('reports hasKey true with the creation date when a key exists (happy path)', async () => {
      const createdAt = new Date();
      usersService.findById.mockResolvedValue(
        makeUser({ apiKeyHash: 'irrelevant-hash', apiKeyCreatedAt: createdAt }),
      );

      const result = await service.getApiKeyStatus('user-1');

      expect(result).toEqual({ hasKey: true, createdAt });
    });

    it('reports hasKey false when no key exists (edge case)', async () => {
      usersService.findById.mockResolvedValue(makeUser());

      const result = await service.getApiKeyStatus('user-1');

      expect(result).toEqual({ hasKey: false, createdAt: undefined });
    });
  });

  describe('validateApiKey', () => {
    it("resolves the owning user's id and email for a valid key (happy path)", async () => {
      const { apiKey } = await service.generateApiKey('user-1');
      const storedHash = usersService.setApiKeyHash.mock.calls[0][1];
      usersService.findByApiKeyHash.mockResolvedValue(
        makeUser({ apiKeyHash: storedHash }),
      );

      const result = await service.validateApiKey(apiKey);

      expect(usersService.findByApiKeyHash).toHaveBeenCalledWith(storedHash);
      expect(result).toEqual({ userId: 'user-1', email: 'alice@example.com' });
    });

    it('returns null for an unknown or revoked key (negative case)', async () => {
      usersService.findByApiKeyHash.mockResolvedValue(null);

      const result = await service.validateApiKey('bwh_not-a-real-key');

      expect(result).toBeNull();
    });

    it("returns null for a locked user's key, even if otherwise valid (negative case)", async () => {
      const { apiKey } = await service.generateApiKey('user-1');
      const storedHash = usersService.setApiKeyHash.mock.calls[0][1];
      usersService.findByApiKeyHash.mockResolvedValue(
        makeUser({ apiKeyHash: storedHash, isLocked: true }),
      );

      const result = await service.validateApiKey(apiKey);

      expect(result).toBeNull();
    });
  });

  describe('approveAndSendCode', () => {
    it('approves a pending user and sends their verification code (happy path)', async () => {
      usersService.findById.mockResolvedValue(
        makeUser({ approvalStatus: 'pending' }),
      );

      await service.approveAndSendCode('user-1');

      expect(usersService.setApprovalStatus).toHaveBeenCalledWith(
        'user-1',
        'approved',
      );
      expect(mailService.sendVerificationCode).toHaveBeenCalledWith(
        'alice@example.com',
        expect.stringMatching(/^\d{6}$/),
      );
    });

    it('rejects an already-approved user (negative case)', async () => {
      usersService.findById.mockResolvedValue(
        makeUser({ approvalStatus: 'approved' }),
      );

      await expect(service.approveAndSendCode('user-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mailService.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('rejects an unknown user (negative case)', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.approveAndSendCode('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
