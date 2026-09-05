import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from '../auth.service';

function makeContext(authorization?: string): ExecutionContext {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let jwtService: { verifyAsync: jest.Mock };
  let authService: { validateApiKey: jest.Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    authService = { validateApiKey: jest.fn() };
    guard = new JwtAuthGuard(
      jwtService as never,
      { get: jest.fn() } as never,
      authService as unknown as AuthService,
    );
  });

  it('rejects a request with no Authorization header (negative case)', async () => {
    const context = makeContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(authService.validateApiKey).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer Authorization header (edge case)', async () => {
    const context = makeContext('Basic dXNlcjpwYXNz');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('authenticates with a valid JWT without touching the API-key path (happy path)', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'alice@example.com',
    });
    const context = makeContext('Bearer a-valid-jwt');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authService.validateApiKey).not.toHaveBeenCalled();
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    expect(request.user).toEqual({
      userId: 'user-1',
      email: 'alice@example.com',
    });
  });

  it('falls back to API-key validation when the token is not a valid JWT (happy path)', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    authService.validateApiKey.mockResolvedValue({
      userId: 'user-2',
      email: 'bob@example.com',
    });
    const context = makeContext('Bearer bwh_some-api-key');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authService.validateApiKey).toHaveBeenCalledWith('bwh_some-api-key');
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    expect(request.user).toEqual({
      userId: 'user-2',
      email: 'bob@example.com',
    });
  });

  it('rejects when the token is neither a valid JWT nor a known API key (negative case)', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    authService.validateApiKey.mockResolvedValue(null);
    const context = makeContext('Bearer garbage');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // Known, accepted scope limit (see PLAN.md / registration-approval plan):
  // this guard never hits the database on the JWT-verify-success path, so
  // a user locked *after* their access token was issued keeps
  // authenticating ordinary requests until that token naturally expires
  // (JWT_ACCESS_EXPIRES_IN, 15 minutes by default). Only login, refresh,
  // and API-key auth re-check isLocked in real time. Pinned here as an
  // explicit, intentional case rather than a silent gap.
  it('still authenticates a still-valid JWT belonging to a since-locked user (edge case — known scope limit)', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'alice@example.com',
    });
    const context = makeContext('Bearer a-valid-jwt-issued-before-the-lock');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authService.validateApiKey).not.toHaveBeenCalled();
  });
});
