import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
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
      providers: [{ provide: ApplicationsService, useValue: service }],
    }).compile();

    controller = module.get<ApplicationsController>(ApplicationsController);
  });

  describe('findDuplicateGroups', () => {
    it('wraps the service result in a pairs envelope (happy path)', async () => {
      service.findDuplicateGroups.mockResolvedValueOnce([{ a: 'x', b: 'y' }]);

      const result = await controller.findDuplicateGroups(user);

      expect(service.findDuplicateGroups).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ pairs: [{ a: 'x', b: 'y' }] });
    });
  });

  describe('checkSimilar', () => {
    it('passes jobTitle and company through and wraps the result in a matches envelope (happy path)', async () => {
      service.findSimilarApplications.mockResolvedValueOnce([
        { jobTitle: 'x' },
      ]);

      const result = await controller.checkSimilar(
        user,
        'Backend Engineer',
        'Acme',
      );

      expect(service.findSimilarApplications).toHaveBeenCalledWith(
        'user-1',
        'Backend Engineer',
        'Acme',
      );
      expect(result).toEqual({ matches: [{ jobTitle: 'x' }] });
    });
  });

  describe('merge', () => {
    it('delegates to the service with keepId and mergeId (happy path)', () => {
      controller.merge(user, 'keep-1', 'merge-1');

      expect(service.merge).toHaveBeenCalledWith('user-1', 'keep-1', 'merge-1');
    });
  });
});
