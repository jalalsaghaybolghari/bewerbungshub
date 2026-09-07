import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import type { EmailMatch, GmailStatus } from '@bewerber/shared';
import { GmailController } from './gmail.controller';
import { GmailService } from './gmail.service';
import { EmailMatchService } from './email-match.service';
import { AuthService } from '../auth/auth.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

const JWT_SECRET = 'test-jwt-secret';
const WEB_APP_URL = 'https://example.com';

function makeConfig(): ConfigService {
  const values: Record<string, string> = {
    'jwt.accessSecret': JWT_SECRET,
    webAppUrl: WEB_APP_URL,
  };
  return { get: (key: string) => values[key] } as ConfigService;
}

// See the identical comment in google-drive.controller.spec.ts — a plain
// mock avoids ESLint's unbound-method rule tripping on `res.redirect`.
function makeResponse() {
  return { redirect: jest.fn<Response, [string]>() };
}

describe('GmailController', () => {
  let controller: GmailController;
  let jwtService: JwtService;
  const service = {
    getStatus: jest.fn<Promise<GmailStatus>, [string]>(),
    buildAuthUrl: jest.fn<string, [string]>(),
    completeConnection: jest.fn<Promise<void>, [string, string]>(),
    disconnect: jest.fn<Promise<void>, [string]>(),
  };
  const emailMatchService = {
    findPending: jest.fn<Promise<EmailMatch[]>, [string]>(),
    approve: jest.fn<Promise<void>, [string, string]>(),
    reject: jest.fn<Promise<void>, [string, string]>(),
  };
  const user: RequestUser = { userId: 'user-1', email: 'a@b.com' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GmailController],
      providers: [
        { provide: GmailService, useValue: service },
        { provide: EmailMatchService, useValue: emailMatchService },
        JwtService,
        { provide: ConfigService, useValue: makeConfig() },
        { provide: AuthService, useValue: { validateApiKey: jest.fn() } },
      ],
    }).compile();

    controller = module.get(GmailController);
    jwtService = module.get(JwtService);
  });

  describe('status', () => {
    it('delegates to the service (happy path)', async () => {
      service.getStatus.mockResolvedValue({
        connected: true,
        connectedAt: new Date('2026-01-01T00:00:00.000Z'),
        needsReconnect: false,
      });

      const result = await controller.status(user);

      expect(service.getStatus).toHaveBeenCalledWith('user-1');
      expect(result).toMatchObject({ connected: true, needsReconnect: false });
    });
  });

  describe('connectUrl', () => {
    it('signs a purpose-scoped state and passes it to buildAuthUrl (happy path)', async () => {
      service.buildAuthUrl.mockReturnValue(
        'https://accounts.google.com/consent',
      );

      const result = await controller.connectUrl(user);

      expect(result).toEqual({ url: 'https://accounts.google.com/consent' });
      const [state] = service.buildAuthUrl.mock.calls[0];
      const payload = await jwtService.verifyAsync<{
        sub: string;
        purpose: string;
      }>(state, {
        secret: JWT_SECRET,
      });
      expect(payload).toMatchObject({
        sub: 'user-1',
        purpose: 'gmail-connect',
      });
    });
  });

  describe('callback', () => {
    async function signState(
      overrides: Partial<{ sub: string; purpose: string }> = {},
    ) {
      return jwtService.signAsync(
        { sub: 'user-1', purpose: 'gmail-connect', ...overrides },
        { secret: JWT_SECRET, expiresIn: '10m' },
      );
    }

    it('completes the connection and redirects with success on a valid callback (happy path)', async () => {
      const state = await signState();
      const res = makeResponse();

      await controller.callback(
        'auth-code',
        state,
        undefined,
        res as unknown as Response,
      );

      expect(service.completeConnection).toHaveBeenCalledWith(
        'user-1',
        'auth-code',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        `${WEB_APP_URL}/settings?gmailConnected=1`,
      );
    });

    it('redirects with a denied error when Google reports one, without calling the service (negative case)', async () => {
      const res = makeResponse();

      await controller.callback(
        undefined,
        undefined,
        'access_denied',
        res as unknown as Response,
      );

      expect(service.completeConnection).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        `${WEB_APP_URL}/settings?gmailError=denied`,
      );
    });

    it('rejects a state signed with the wrong secret (negative case)', async () => {
      const tampered = await new JwtService().signAsync(
        { sub: 'user-1', purpose: 'gmail-connect' },
        { secret: 'wrong-secret', expiresIn: '10m' },
      );
      const res = makeResponse();

      await controller.callback(
        'auth-code',
        tampered,
        undefined,
        res as unknown as Response,
      );

      expect(service.completeConnection).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        `${WEB_APP_URL}/settings?gmailError=invalid_state`,
      );
    });

    it('rejects an expired state (negative case)', async () => {
      const expired = await jwtService.signAsync(
        { sub: 'user-1', purpose: 'gmail-connect' },
        { secret: JWT_SECRET, expiresIn: '-1s' },
      );
      const res = makeResponse();

      await controller.callback(
        'auth-code',
        expired,
        undefined,
        res as unknown as Response,
      );

      expect(service.completeConnection).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        `${WEB_APP_URL}/settings?gmailError=invalid_state`,
      );
    });

    it('rejects a validly-signed state carrying the wrong purpose (negative case)', async () => {
      const state = await signState({ purpose: 'something-else' });
      const res = makeResponse();

      await controller.callback(
        'auth-code',
        state,
        undefined,
        res as unknown as Response,
      );

      expect(service.completeConnection).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        `${WEB_APP_URL}/settings?gmailError=invalid_state`,
      );
    });

    it('redirects with a connect_failed error when the token exchange itself fails (edge case)', async () => {
      const state = await signState();
      service.completeConnection.mockRejectedValueOnce(
        new Error('exchange failed'),
      );
      const res = makeResponse();

      await controller.callback(
        'auth-code',
        state,
        undefined,
        res as unknown as Response,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        `${WEB_APP_URL}/settings?gmailError=connect_failed`,
      );
    });
  });

  describe('disconnect', () => {
    it('delegates to the service (happy path)', async () => {
      await controller.disconnect(user);

      expect(service.disconnect).toHaveBeenCalledWith('user-1');
    });
  });

  describe('pending', () => {
    it('delegates to the service (happy path)', async () => {
      emailMatchService.findPending.mockResolvedValue([]);

      await controller.pending(user);

      expect(emailMatchService.findPending).toHaveBeenCalledWith('user-1');
    });
  });

  describe('approvePending', () => {
    it('delegates to the service with the current user and match id (happy path)', async () => {
      await controller.approvePending(user, 'match-1');

      expect(emailMatchService.approve).toHaveBeenCalledWith(
        'user-1',
        'match-1',
      );
    });
  });

  describe('rejectPending', () => {
    it('delegates to the service with the current user and match id (happy path)', async () => {
      await controller.rejectPending(user, 'match-1');

      expect(emailMatchService.reject).toHaveBeenCalledWith(
        'user-1',
        'match-1',
      );
    });
  });
});
