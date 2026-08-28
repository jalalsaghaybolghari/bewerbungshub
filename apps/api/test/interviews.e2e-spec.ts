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
    applyLink: 'https://example.com/jobs/interviews-test',
    applyType: 'linkedin',
    ...overrides,
  };
}

describe('Interviews (e2e)', () => {
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

  describe('POST /applications/:id/interviews', () => {
    it('schedules an interview (happy path)', async () => {
      const res = await authed
        .post(`/api/v1/applications/${applicationId}/interviews`)
        .send({
          round: 1,
          type: 'technical',
          scheduledAt: '2026-09-01T14:00:00.000Z',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        round: 1,
        type: 'technical',
        outcome: 'pending',
      });

      const detail = await authed
        .get(`/api/v1/applications/${applicationId}`)
        .expect(200);
      expect(detail.body.interviews).toHaveLength(1);
    });

    it('rejects an invalid interview type (negative case)', async () => {
      await authed
        .post(`/api/v1/applications/${applicationId}/interviews`)
        .send({
          round: 1,
          type: 'not-a-real-type',
          scheduledAt: '2026-09-01T14:00:00.000Z',
        })
        .expect(400);
    });

    it("404s scheduling an interview for another user's application (negative case)", async () => {
      const other = await registerUser(app);
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationId}/interviews`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({
          round: 1,
          type: 'technical',
          scheduledAt: '2026-09-01T14:00:00.000Z',
        })
        .expect(404);
    });

    it('accepts multiple rounds for the same application (edge case)', async () => {
      await authed
        .post(`/api/v1/applications/${applicationId}/interviews`)
        .send({
          round: 1,
          type: 'phone_screen',
          scheduledAt: '2026-09-01T14:00:00.000Z',
        })
        .expect(201);
      await authed
        .post(`/api/v1/applications/${applicationId}/interviews`)
        .send({
          round: 2,
          type: 'onsite',
          scheduledAt: '2026-09-08T14:00:00.000Z',
        })
        .expect(201);

      const detail = await authed
        .get(`/api/v1/applications/${applicationId}`)
        .expect(200);
      expect(detail.body.interviews).toHaveLength(2);
    });
  });

  describe('PATCH /interviews/:id', () => {
    it('records an outcome (happy path)', async () => {
      const created = await authed
        .post(`/api/v1/applications/${applicationId}/interviews`)
        .send({
          round: 1,
          type: 'technical',
          scheduledAt: '2026-09-01T14:00:00.000Z',
        });

      const res = await authed
        .patch(`/api/v1/interviews/${created.body._id}`)
        .send({ outcome: 'passed', feedbackNotes: 'Went well' })
        .expect(200);

      expect(res.body).toMatchObject({
        outcome: 'passed',
        feedbackNotes: 'Went well',
      });
    });

    it('404s updating an interview that does not exist (edge case)', async () => {
      await authed
        .patch('/api/v1/interviews/507f1f77bcf86cd799439011')
        .send({ outcome: 'passed' })
        .expect(404);
    });
  });

  describe('DELETE /interviews/:id', () => {
    it('removes the interview (happy path)', async () => {
      const created = await authed
        .post(`/api/v1/applications/${applicationId}/interviews`)
        .send({
          round: 1,
          type: 'technical',
          scheduledAt: '2026-09-01T14:00:00.000Z',
        });

      await authed.delete(`/api/v1/interviews/${created.body._id}`).expect(204);

      const detail = await authed
        .get(`/api/v1/applications/${applicationId}`)
        .expect(200);
      expect(detail.body.interviews).toHaveLength(0);
    });

    it("404s deleting another user's interview (negative case)", async () => {
      const created = await authed
        .post(`/api/v1/applications/${applicationId}/interviews`)
        .send({
          round: 1,
          type: 'technical',
          scheduledAt: '2026-09-01T14:00:00.000Z',
        });

      const other = await registerUser(app);
      await request(app.getHttpServer())
        .delete(`/api/v1/interviews/${created.body._id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });
  });
});
