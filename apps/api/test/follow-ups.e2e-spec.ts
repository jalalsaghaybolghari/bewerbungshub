import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp, TestAppContext } from './utils/test-app';
import { registerUser, RegisteredUser } from './utils/auth';

function sampleApplication(overrides: Record<string, unknown> = {}) {
  return {
    jobTitle: 'Senior Frontend Developer',
    company: { name: 'Nordwerk Digital' },
    location: { raw: 'Linz, hybrid' },
    jobDescription: 'We are looking for a senior frontend developer.',
    applyLink: 'https://example.com/jobs/follow-ups-test',
    applyType: 'linkedin',
    ...overrides,
  };
}

describe('Follow-ups (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let user: RegisteredUser;
  let applicationId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  const authed = {
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${user.accessToken}`),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${user.accessToken}`),
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${user.accessToken}`),
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${user.accessToken}`),
  };

  beforeEach(async () => {
    user = await registerUser(app);
    const created = await authed.post('/api/v1/applications').send(
      sampleApplication({
        applyLink: `https://example.com/jobs/${Date.now()}-${Math.random()}`,
      }),
    );
    applicationId = (created.body as { _id: string })._id;
  });

  describe('POST /applications/:id/follow-ups', () => {
    it('schedules a follow-up and syncs Application.nextFollowUpAt (happy path)', async () => {
      const dueAt = '2026-09-05T09:00:00.000Z';
      const res = await authed
        .post(`/api/v1/applications/${applicationId}/follow-ups`)
        .send({ dueAt, channel: 'email' })
        .expect(201);

      expect(res.body).toMatchObject({ channel: 'email', status: 'scheduled' });

      const detail = await authed
        .get(`/api/v1/applications/${applicationId}`)
        .expect(200);
      expect(detail.body.followUps).toHaveLength(1);
      expect(
        new Date(detail.body.application.nextFollowUpAt).toISOString(),
      ).toBe(dueAt);
    });

    it('rejects an invalid channel (negative case)', async () => {
      await authed
        .post(`/api/v1/applications/${applicationId}/follow-ups`)
        .send({ dueAt: '2026-09-05T09:00:00.000Z', channel: 'carrier-pigeon' })
        .expect(400);
    });

    it('nextFollowUpAt tracks the earliest of several scheduled follow-ups (edge case)', async () => {
      await authed
        .post(`/api/v1/applications/${applicationId}/follow-ups`)
        .send({ dueAt: '2026-09-10T09:00:00.000Z', channel: 'email' })
        .expect(201);
      await authed
        .post(`/api/v1/applications/${applicationId}/follow-ups`)
        .send({ dueAt: '2026-09-03T09:00:00.000Z', channel: 'linkedin' })
        .expect(201);

      const detail = await authed
        .get(`/api/v1/applications/${applicationId}`)
        .expect(200);
      expect(
        new Date(detail.body.application.nextFollowUpAt).toISOString(),
      ).toBe('2026-09-03T09:00:00.000Z');
    });
  });

  describe('PATCH /follow-ups/:id', () => {
    it('marking sent increments followUpCount and clears nextFollowUpAt (happy path)', async () => {
      const created = await authed
        .post(`/api/v1/applications/${applicationId}/follow-ups`)
        .send({ dueAt: '2026-09-05T09:00:00.000Z', channel: 'email' });

      const res = await authed
        .patch(`/api/v1/follow-ups/${created.body._id}`)
        .send({ status: 'sent' })
        .expect(200);
      expect(res.body.status).toBe('sent');
      expect(res.body.sentAt).toBeTruthy();

      const detail = await authed
        .get(`/api/v1/applications/${applicationId}`)
        .expect(200);
      expect(detail.body.application.followUpCount).toBe(1);
      expect(detail.body.application.nextFollowUpAt).toBeUndefined();
    });

    it('404s updating a follow-up that does not exist (edge case)', async () => {
      await authed
        .patch('/api/v1/follow-ups/507f1f77bcf86cd799439011')
        .send({ status: 'sent' })
        .expect(404);
    });
  });

  describe('DELETE /follow-ups/:id', () => {
    it('removes the follow-up and recomputes nextFollowUpAt (happy path)', async () => {
      const created = await authed
        .post(`/api/v1/applications/${applicationId}/follow-ups`)
        .send({ dueAt: '2026-09-05T09:00:00.000Z', channel: 'email' });

      await authed.delete(`/api/v1/follow-ups/${created.body._id}`).expect(204);

      const detail = await authed
        .get(`/api/v1/applications/${applicationId}`)
        .expect(200);
      expect(detail.body.followUps).toHaveLength(0);
      expect(detail.body.application.nextFollowUpAt).toBeUndefined();
    });

    it("404s deleting another user's follow-up (negative case)", async () => {
      const created = await authed
        .post(`/api/v1/applications/${applicationId}/follow-ups`)
        .send({ dueAt: '2026-09-05T09:00:00.000Z', channel: 'email' });

      const other = await registerUser(app);
      await request(app.getHttpServer())
        .delete(`/api/v1/follow-ups/${created.body._id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });
  });
});
