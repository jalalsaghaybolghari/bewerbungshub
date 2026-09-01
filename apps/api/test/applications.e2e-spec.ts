import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp, TestAppContext } from './utils/test-app';
import { registerUser, RegisteredUser } from './utils/auth';

function sampleApplication(overrides: Record<string, unknown> = {}) {
  return {
    jobTitle: 'Senior Frontend Developer',
    company: { name: 'Nordwerk Digital' },
    location: { raw: 'Linz, hybrid', city: 'Linz', remoteType: 'hybrid' },
    jobDescription: 'We are looking for a senior frontend developer.',
    applyLink: 'https://example.com/jobs/123',
    applyType: 'linkedin',
    ...overrides,
  };
}

describe('Applications (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let user: RegisteredUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    user = await registerUser(app);
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

  describe('POST /applications', () => {
    it('creates an application and writes a "created" event (happy path)', async () => {
      const res = await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);

      expect(res.body).toMatchObject({
        jobTitle: 'Senior Frontend Developer',
        status: 'applied',
      });

      const detail = await authed
        .get(`/api/v1/applications/${res.body._id}`)
        .expect(200);
      expect(detail.body.events).toHaveLength(1);
      expect(detail.body.events[0]).toMatchObject({
        type: 'created',
        actor: 'user',
      });
    });

    it('rejects a duplicate apply link for the same user (negative case)', async () => {
      await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);
      await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(409);
    });

    it('rejects an invalid apply link (negative case)', async () => {
      await authed
        .post('/api/v1/applications')
        .send(sampleApplication({ applyLink: 'not-a-url' }))
        .expect(400);
    });

    it('rejects an unauthenticated request (negative case)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(401);
    });

    it('allows the same apply link for two different users (edge case)', async () => {
      const other = await registerUser(app);
      await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send(sampleApplication())
        .expect(201);
    });

    it('sets sentAt immediately when created with a non-draft status (happy path)', async () => {
      const res = await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);

      expect(res.body.status).toBe('applied');
      expect(res.body.sentAt).toBeTruthy();
    });

    it('leaves sentAt unset when created as a draft (edge case)', async () => {
      const res = await authed
        .post('/api/v1/applications')
        .send(sampleApplication({ status: 'draft' }))
        .expect(201);

      expect(res.body.status).toBe('draft');
      expect(res.body.sentAt).toBeFalsy();
    });
  });

  describe('GET /applications', () => {
    it("lists only the current user's applications, paginated (happy path)", async () => {
      await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);
      await authed
        .post('/api/v1/applications')
        .send(
          sampleApplication({
            applyLink: 'https://example.com/jobs/456',
            jobTitle: 'Backend Engineer',
          }),
        )
        .expect(201);

      const other = await registerUser(app);
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send(sampleApplication())
        .expect(201);

      const res = await authed
        .get('/api/v1/applications?pageSize=1&page=1')
        .expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items).toHaveLength(1);
    });

    it('filters by status (happy path)', async () => {
      await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);

      const res = await authed
        .get('/api/v1/applications?status=interview')
        .expect(200);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it('returns an empty page when the user has no applications (edge case)', async () => {
      const res = await authed.get('/api/v1/applications').expect(200);
      expect(res.body).toMatchObject({ items: [], total: 0 });
    });
  });

  describe('GET /applications/:id', () => {
    it("404s for another user's application (negative case — ownership check)", async () => {
      const created = await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);
      const other = await registerUser(app);

      await request(app.getHttpServer())
        .get(`/api/v1/applications/${created.body._id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });

    it('404s for a well-formed but non-existent id (edge case)', async () => {
      await authed
        .get('/api/v1/applications/507f1f77bcf86cd799439011')
        .expect(404);
    });
  });

  describe('POST /applications/:id/status', () => {
    it('changes status and writes a status_changed event (happy path)', async () => {
      const created = await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);

      const res = await authed
        .post(`/api/v1/applications/${created.body._id}/status`)
        .send({ status: 'interview', note: 'Phone screen scheduled' })
        .expect(201);
      expect(res.body.status).toBe('interview');

      const detail = await authed
        .get(`/api/v1/applications/${created.body._id}`)
        .expect(200);
      const statusEvent = detail.body.events.find(
        (e: { type: string }) => e.type === 'status_changed',
      );
      expect(statusEvent).toMatchObject({
        payload: { from: 'applied', to: 'interview' },
      });
    });

    it('rejects an invalid status value (negative case)', async () => {
      const created = await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);
      await authed
        .post(`/api/v1/applications/${created.body._id}/status`)
        .send({ status: 'not-a-real-status' })
        .expect(400);
    });

    it('a PATCH cannot silently change status (negative case)', async () => {
      const created = await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);
      await authed
        .patch(`/api/v1/applications/${created.body._id}`)
        .send({ status: 'offer' })
        .expect(200);

      const detail = await authed
        .get(`/api/v1/applications/${created.body._id}`)
        .expect(200);
      expect(detail.body.application.status).toBe('applied');
      expect(detail.body.events).toHaveLength(1); // only "created" — no status_changed event
    });

    it('sets sentAt the first time a draft leaves draft, not before (happy path)', async () => {
      const created = await authed
        .post('/api/v1/applications')
        .send(sampleApplication({ status: 'draft' }))
        .expect(201);
      expect(created.body.sentAt).toBeFalsy();

      const res = await authed
        .post(`/api/v1/applications/${created.body._id}/status`)
        .send({ status: 'applied' })
        .expect(201);

      expect(res.body.sentAt).toBeTruthy();
    });

    it('does not overwrite sentAt on a later status change (edge case)', async () => {
      const created = await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);
      const originalSentAt = created.body.sentAt;
      expect(originalSentAt).toBeTruthy();

      const res = await authed
        .post(`/api/v1/applications/${created.body._id}/status`)
        .send({ status: 'interview' })
        .expect(201);

      expect(res.body.sentAt).toBe(originalSentAt);
    });
  });

  describe('DELETE /applications/:id', () => {
    it('soft-deletes and excludes it from the list (happy path)', async () => {
      const created = await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);
      await authed
        .delete(`/api/v1/applications/${created.body._id}`)
        .expect(204);

      const list = await authed.get('/api/v1/applications').expect(200);
      expect(list.body.items).toHaveLength(0);
    });

    it("404s deleting another user's application (negative case)", async () => {
      const created = await authed
        .post('/api/v1/applications')
        .send(sampleApplication())
        .expect(201);
      const other = await registerUser(app);

      await request(app.getHttpServer())
        .delete(`/api/v1/applications/${created.body._id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });
  });

  describe('GET /applications/check-duplicate', () => {
    it('reports exists:false for an unused link, then exists:true after creating it (happy path)', async () => {
      const before = await authed
        .get(
          '/api/v1/applications/check-duplicate?applyLink=https://example.com/jobs/789',
        )
        .expect(200);
      expect(before.body.exists).toBe(false);

      const created = await authed
        .post('/api/v1/applications')
        .send(sampleApplication({ applyLink: 'https://example.com/jobs/789' }))
        .expect(201);

      const after = await authed
        .get(
          '/api/v1/applications/check-duplicate?applyLink=https://example.com/jobs/789',
        )
        .expect(200);
      expect(after.body).toEqual({ exists: true, id: created.body._id });
    });
  });

  describe('GET /applications/stats', () => {
    it('returns zeroed stats for a user with no applications (edge case)', async () => {
      const res = await authed.get('/api/v1/applications/stats').expect(200);
      expect(res.body).toMatchObject({
        total: 0,
        responseRate: 0,
        byStatus: {},
        overdueFollowUps: [],
      });
    });

    it('counts total and byStatus/byApplyType correctly (happy path)', async () => {
      await authed.post('/api/v1/applications').send(
        sampleApplication({
          applyLink: 'https://example.com/jobs/stats-1',
          applyType: 'linkedin',
        }),
      );
      const second = await authed.post('/api/v1/applications').send(
        sampleApplication({
          applyLink: 'https://example.com/jobs/stats-2',
          applyType: 'email',
        }),
      );
      await authed
        .post(`/api/v1/applications/${second.body._id}/status`)
        .send({ status: 'interview' });

      const res = await authed.get('/api/v1/applications/stats').expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.byStatus).toMatchObject({ applied: 1, interview: 1 });
      expect(res.body.byApplyType).toMatchObject({ linkedin: 1, email: 1 });
      // 1 of 2 non-draft applications moved past "applied" → 50%
      expect(res.body.responseRate).toBe(50);
    });

    it("only counts the current user's applications, not another user's (negative case)", async () => {
      const other = await registerUser(app);
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send(
          sampleApplication({
            applyLink: 'https://example.com/jobs/stats-other',
          }),
        )
        .expect(201);

      const res = await authed.get('/api/v1/applications/stats').expect(200);
      expect(res.body.total).toBe(0);
    });

    it('rejects an unauthenticated request (negative case)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/applications/stats')
        .expect(401);
    });
  });
});
