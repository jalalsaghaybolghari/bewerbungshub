import { Test, TestingModule } from '@nestjs/testing';
import { healthResponseSchema } from '@bewerber/shared';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('reports ok status (happy path)', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
  });

  it('returns a payload matching the shared health schema', () => {
    expect(() => healthResponseSchema.parse(controller.check())).not.toThrow();
  });
});
