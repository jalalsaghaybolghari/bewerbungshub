import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { UsersService } from '../../users/users.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';

function makeContext(user?: RequestUser): ExecutionContext {
  const request: { user?: RequestUser } = { user };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  let usersService: { findById: jest.Mock };
  let guard: AdminGuard;

  beforeEach(() => {
    usersService = { findById: jest.fn() };
    guard = new AdminGuard(usersService as unknown as UsersService);
  });

  it('allows an admin user through (happy path)', async () => {
    usersService.findById.mockResolvedValue({ isAdmin: true });
    const context = makeContext({
      userId: 'user-1',
      email: 'admin@example.com',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(usersService.findById).toHaveBeenCalledWith('user-1');
  });

  it('rejects a user found but not an admin (negative case)', async () => {
    usersService.findById.mockResolvedValue({ isAdmin: false });
    const context = makeContext({
      userId: 'user-1',
      email: 'user@example.com',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when request.user is missing, without calling the database (negative case)', async () => {
    const context = makeContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('rejects when the user no longer exists (edge case — deleted between JWT issuance and this request)', async () => {
    usersService.findById.mockResolvedValue(null);
    const context = makeContext({
      userId: 'ghost-user',
      email: 'gone@example.com',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
