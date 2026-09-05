import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { AuthService } from '../auth/auth.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

describe('ApplicationsController', () => {
  let controller: ApplicationsController;
  const service = {
    findDuplicateGroups: jest.fn(),
    findSimilarApplications: jest.fn(),
    merge: jest.fn(),
  };
  const user: RequestUser = { userId: 'user-1', email: 'a@b.com' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [
        { provide: ApplicationsService, useValue: service },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuthService, useValue: { validateApiKey: jest.fn() } },
      ],
    }).compile();

    controller = module.get<ApplicationsController>(ApplicationsController);
  });

  describe('findDuplicateGroups', () => {
    it('wraps the service result in a pairs envelope and passes the match dimensions through (happy path)', async () => {
      service.findDuplicateGroups.mockResolvedValueOnce([{ a: 'x', b: 'y' }]);

      const result = await controller.findDuplicateGroups(user, {
        title: true,
        company: false,
        location: true,
      });

      expect(service.findDuplicateGroups).toHaveBeenCalledWith('user-1', {
        title: true,
        company: false,
        location: true,
      });
      expect(result).toEqual({ pairs: [{ a: 'x', b: 'y' }] });
    });
  });

  describe('checkSimilar', () => {
    it('passes jobTitle, company, and location through and wraps the result in a matches envelope (happy path)', async () => {
      service.findSimilarApplications.mockResolvedValueOnce([
        { jobTitle: 'x' },
      ]);

      const result = await controller.checkSimilar(
        user,
        'Backend Engineer',
        'Acme',
        'Vienna',
      );

      expect(service.findSimilarApplications).toHaveBeenCalledWith(
        'user-1',
        'Backend Engineer',
        'Acme',
        'Vienna',
      );
      expect(result).toEqual({ matches: [{ jobTitle: 'x' }] });
    });
  });

  describe('merge', () => {
    it('delegates to the service with keepId and mergeId (happy path)', () => {
      void controller.merge(user, 'keep-1', 'merge-1');

      expect(service.merge).toHaveBeenCalledWith('user-1', 'keep-1', 'merge-1');
    });
  });
});
