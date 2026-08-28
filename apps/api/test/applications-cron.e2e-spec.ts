import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { closeTestApp, createTestApp, TestAppContext } from './utils/test-app';
import { registerUser, RegisteredUser } from './utils/auth';
import { ApplicationsCronService } from '../src/applications/applications-cron.service';
import {
  Application,
  ApplicationDocument,
} from '../src/applications/schemas/application.schema';
import { Event, EventDocument } from '../src/applications/schemas/event.schema';

function sampleApplication(overrides: Record<string, unknown> = {}) {
  return {
    jobTitle: 'Senior Frontend Developer',
    company: { name: 'Nordwerk Digital' },
    location: { raw: 'Linz, hybrid' },
    jobDescription: 'We are looking for a senior frontend developer.',
    applyLink: `https://example.com/jobs/cron-${Date.now()}-${Math.random()}`,
    applyType: 'linkedin',
    ...overrides,
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe('Applications ghosted-marking cron (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let cronService: ApplicationsCronService;
  let applicationModel: Model<ApplicationDocument>;
  let eventModel: Model<EventDocument>;
  let user: RegisteredUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    cronService = app.get(ApplicationsCronService);
    applicationModel = app.get(getModelToken(Application.name));
    eventModel = app.get(getModelToken(Event.name));
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    user = await registerUser(app);
  });

  async function createBackdated(status: string, changedDaysAgo: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send(sampleApplication())
      .expect(201);

    await applicationModel
      .updateOne(
        { _id: res.body._id },
        { status, statusChangedAt: daysAgo(changedDaysAgo) },
      )
      .exec();

    return res.body._id as string;
  }

  it('marks a stale "applied" application ghosted and writes a system event (happy path)', async () => {
    const id = await createBackdated('applied', 25); // default ghostedAfterDays = 21

    const marked = await cronService.markGhostedApplications();
    expect(marked).toBeGreaterThanOrEqual(1);

    const application = await applicationModel.findById(id).exec();
    expect(application?.status).toBe('ghosted');
    expect(application?.statusSetBy).toBe('system');

    const events = await eventModel.find({ applicationId: id }).exec();
    const ghostedEvent = events.find(
      (e) => (e.payload as { to?: string })?.to === 'ghosted',
    );
    expect(ghostedEvent).toMatchObject({
      actor: 'system',
      type: 'status_changed',
    });
  });

  it('does not touch a recently-updated application (negative case)', async () => {
    const id = await createBackdated('applied', 1);

    await cronService.markGhostedApplications();

    const application = await applicationModel.findById(id).exec();
    expect(application?.status).toBe('applied');
  });

  it('does not ghost an application already in a terminal status (negative case)', async () => {
    const id = await createBackdated('rejected', 30);

    await cronService.markGhostedApplications();

    const application = await applicationModel.findById(id).exec();
    expect(application?.status).toBe('rejected');
  });

  it('does not ghost an application with an active offer (negative case)', async () => {
    const id = await createBackdated('offer', 30);

    await cronService.markGhostedApplications();

    const application = await applicationModel.findById(id).exec();
    expect(application?.status).toBe('offer');
  });

  it("respects the user's custom ghostedAfterDays setting (edge case)", async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ ghostedAfterDays: 5 })
      .expect(200);

    const staleId = await createBackdated('screening', 10);
    const freshId = await createBackdated('screening', 2);

    await cronService.markGhostedApplications();

    const stale = await applicationModel.findById(staleId).exec();
    const fresh = await applicationModel.findById(freshId).exec();
    expect(stale?.status).toBe('ghosted');
    expect(fresh?.status).toBe('screening');
  });
});
