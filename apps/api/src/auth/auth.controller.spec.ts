import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

// First spec for AuthController — thin, mocked AuthService/UsersService,
// matching applications.controller.spec.ts's style. Focused on the new
// register/confirm-email/resend-code routes per the plan: register must
// not leak a session, confirm-email must set the refresh cookie the same
// way login already does.
describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    register: jest.fn(),
    confirmEmail: jest.fn(),
    resendCode: jest.fn(),
    login: jest.fn(),
    generateApiKey: jest.fn(),
    revokeApiKey: jest.fn(),
    getApiKeyStatus: jest.fn(),
  };
  const usersService = { findById: jest.fn() };

  function makeResponse() {
    return { cookie: jest.fn(), clearCookie: jest.fn() };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('register', () => {
    it('delegates to the service and returns its result with no cookie set (happy path)', async () => {
      authService.register.mockReturnValueOnce(
        Promise.resolve({ email: 'alice@example.com' }),
      );

      const result = controller.register({
        email: 'alice@example.com',
        password: 'a very strong password',
        displayName: 'Alice',
      });

      expect(authService.register).toHaveBeenCalledWith({
        email: 'alice@example.com',
        password: 'a very strong password',
        displayName: 'Alice',
      });
      await expect(result).resolves.toEqual({ email: 'alice@example.com' });
    });
  });

  describe('confirmEmail', () => {
    it('sets the refresh cookie and returns the user + accessToken (happy path)', async () => {
      authService.confirmEmail.mockResolvedValueOnce({
        user: { id: 'user-1', email: 'alice@example.com' },
        tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
      });
      const res = makeResponse();

      const result = await controller.confirmEmail(
        { email: 'alice@example.com', code: '123456' },
        res as unknown as Response,
      );

      expect(authService.confirmEmail).toHaveBeenCalledWith({
        email: 'alice@example.com',
        code: '123456',
      });
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-1',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result).toEqual({
        user: { id: 'user-1', email: 'alice@example.com' },
        accessToken: 'access-1',
      });
    });
  });

  describe('resendCode', () => {
    it('delegates to the service (happy path)', async () => {
      authService.resendCode.mockResolvedValueOnce(undefined);

      await controller.resendCode({ email: 'alice@example.com' });

      expect(authService.resendCode).toHaveBeenCalledWith({
        email: 'alice@example.com',
      });
    });
  });

  describe('generateApiKey', () => {
    it('delegates to the service using the current user (happy path)', async () => {
      authService.generateApiKey.mockResolvedValueOnce({
        apiKey: 'bwh_raw-key',
        createdAt: new Date('2026-01-01'),
      });

      const result = await controller.generateApiKey({
        userId: 'user-1',
        email: 'alice@example.com',
      });

      expect(authService.generateApiKey).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        apiKey: 'bwh_raw-key',
        createdAt: new Date('2026-01-01'),
      });
    });
  });

  describe('getApiKeyStatus', () => {
    it('delegates to the service using the current user (happy path)', async () => {
      authService.getApiKeyStatus.mockResolvedValueOnce({ hasKey: false });

      const result = await controller.getApiKeyStatus({
        userId: 'user-1',
        email: 'alice@example.com',
      });

      expect(authService.getApiKeyStatus).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ hasKey: false });
    });
  });

  describe('revokeApiKey', () => {
    it('delegates to the service using the current user (happy path)', async () => {
      authService.revokeApiKey.mockResolvedValueOnce(undefined);

      await controller.revokeApiKey({
        userId: 'user-1',
        email: 'alice@example.com',
      });

      expect(authService.revokeApiKey).toHaveBeenCalledWith('user-1');
    });
  });
});
