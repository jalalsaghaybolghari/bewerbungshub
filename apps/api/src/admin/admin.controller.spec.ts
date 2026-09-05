import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

describe('AdminController', () => {
  let controller: AdminController;
  const adminService = {
    listUsers: jest.fn(),
    getStats: jest.fn(),
    deleteUser: jest.fn(),
  };
  const user: RequestUser = { userId: 'admin-1', email: 'admin@example.com' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: AdminGuard, useValue: { canActivate: () => true } },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuthService, useValue: { validateApiKey: jest.fn() } },
        { provide: UsersService, useValue: { findById: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  describe('listUsers', () => {
    it('delegates to the service (happy path)', async () => {
      adminService.listUsers.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      const result = await controller.listUsers({ page: 1, pageSize: 20 });

      expect(adminService.listUsers).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });
  });

  describe('getStats', () => {
    it('delegates to the service (happy path)', async () => {
      adminService.getStats.mockResolvedValueOnce({ totalUsers: 2 });

      const result = await controller.getStats();

      expect(adminService.getStats).toHaveBeenCalled();
      expect(result).toEqual({ totalUsers: 2 });
    });
  });

  describe('deleteUser', () => {
    it('delegates to the service with the current user and target id (happy path)', async () => {
      adminService.deleteUser.mockResolvedValueOnce(undefined);

      await controller.deleteUser(user, 'target-1');

      expect(adminService.deleteUser).toHaveBeenCalledWith(
        'admin-1',
        'target-1',
      );
    });
  });
});
