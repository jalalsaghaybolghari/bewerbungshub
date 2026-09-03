import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { GoogleDriveController } from './google-drive.controller';
import { GoogleDriveService } from './google-drive.service';
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

// A plain object, not `jest.Mocked<Response>` — Express's `Response` is a
// real interface with `redirect` declared as a method, and referencing
// `res.redirect` (as every assertion below does) trips ESLint's
// unbound-method rule once it's typed against that interface. A plain
// mock avoids that; the actual controller call casts it to `Response`.
function makeResponse() {
  return { redirect: jest.fn<Response, [string]>() };
}

describe('GoogleDriveController', () => {
  let controller: GoogleDriveController;
  let jwtService: JwtService;
  const service = {
    isConnected: jest.fn<Promise<boolean>, [string]>(),
    getConnectedAt: jest.fn<Promise<Date | undefined>, [string]>(),
    buildAuthUrl: jest.fn<string, [string]>(),
    completeConnection: jest.fn<Promise<void>, [string, string]>(),
    disconnect: jest.fn<Promise<void>, [string]>(),
  };
  const user: RequestUser = { userId: 'user-1', email: 'a@b.com' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoogleDriveController],
      providers: [
        { provide: GoogleDriveService, useValue: service },
        JwtService,
        { provide: ConfigService, useValue: makeConfig() },
      ],
    }).compile();

    controller = module.get(GoogleDriveController);
    jwtService = module.get(JwtService);
  });

  describe('status', () => {
    it('returns the connection status and timestamp (happy path)', async () => {
      service.isConnected.mockResolvedValue(true);
      service.getConnectedAt.mockResolvedValue(
        new Date('2026-01-01T00:00:00.000Z'),
      );

      const result = await controller.status(user);

      expect(result).toEqual({
        connected: true,
        connectedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
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
      }>(state, { secret: JWT_SECRET });
      expect(payload).toMatchObject({
        sub: 'user-1',
        purpose: 'google-drive-connect',
      });
    });
  });

  describe('callback', () => {
    async function signState(
      overrides: Partial<{ sub: string; purpose: string }> = {},
    ) {
      return jwtService.signAsync(
        { sub: 'user-1', purpose: 'google-drive-connect', ...overrides },
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
        `${WEB_APP_URL}/cvs?driveConnected=1`,
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
        `${WEB_APP_URL}/cvs?driveError=denied`,
      );
    });

    it('rejects a state signed with the wrong secret (negative case)', async () => {
      const tampered = await new JwtService().signAsync(
        { sub: 'user-1', purpose: 'google-drive-connect' },
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
        `${WEB_APP_URL}/cvs?driveError=invalid_state`,
      );
    });

    it('rejects an expired state (negative case)', async () => {
      const expired = await jwtService.signAsync(
        { sub: 'user-1', purpose: 'google-drive-connect' },
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
        `${WEB_APP_URL}/cvs?driveError=invalid_state`,
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
        `${WEB_APP_URL}/cvs?driveError=invalid_state`,
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
        `${WEB_APP_URL}/cvs?driveError=connect_failed`,
      );
    });
  });

  describe('disconnect', () => {
    it('delegates to the service (happy path)', async () => {
      await controller.disconnect(user);

      expect(service.disconnect).toHaveBeenCalledWith('user-1');
    });
  });
});
