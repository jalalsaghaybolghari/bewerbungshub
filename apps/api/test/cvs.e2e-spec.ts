import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp, TestAppContext } from './utils/test-app';
import { registerUser, RegisteredUser } from './utils/auth';

// A minimal but structurally valid PDF (header + EOF marker) — enough for a
// mimetype/size-driven pipeline that never actually parses the content.
const FAKE_PDF = Buffer.from('%PDF-1.4\n%%EOF');

describe('CVs (e2e)', () => {
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
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${user.accessToken}`),
  };

  describe('POST /cvs', () => {
    it('uploads a PDF and stores its metadata (happy path)', async () => {
      const res = await authed
        .post('/api/v1/cvs')
        .field('label', 'Full-Stack DE v3')
        .field('language', 'de')
        .attach('file', FAKE_PDF, 'cv.pdf')
        .expect(201);

      expect(res.body).toMatchObject({
        label: 'Full-Stack DE v3',
        language: 'de',
        fileName: 'cv.pdf',
        mimeType: 'application/pdf',
        isDefault: false,
      });
    });

    it('rejects a non-PDF file (negative case)', async () => {
      await authed
        .post('/api/v1/cvs')
        .field('label', 'Not a CV')
        .field('language', 'en')
        .attach('file', Buffer.from('plain text'), 'cv.txt')
        .expect(400);
    });

    it('rejects a request with no file attached (negative case)', async () => {
      await authed
        .post('/api/v1/cvs')
        .field('label', 'No file')
        .field('language', 'en')
        .expect(400);
    });

    it('unsets the previous default when a new CV is marked default (edge case)', async () => {
      const first = await authed
        .post('/api/v1/cvs')
        .field('label', 'First')
        .field('language', 'en')
        .field('isDefault', 'true')
        .attach('file', FAKE_PDF, 'first.pdf')
        .expect(201);
      expect(first.body.isDefault).toBe(true);

      await authed
        .post('/api/v1/cvs')
        .field('label', 'Second')
        .field('language', 'en')
        .field('isDefault', 'true')
        .attach('file', FAKE_PDF, 'second.pdf')
        .expect(201);

      const list = await authed.get('/api/v1/cvs').expect(200);
      const stillDefault = list.body.filter(
        (cv: { isDefault: boolean }) => cv.isDefault,
      );
      expect(stillDefault).toHaveLength(1);
      expect(stillDefault[0].label).toBe('Second');
    });
  });

  describe('GET /cvs/:id/file', () => {
    it('streams the uploaded bytes back (happy path)', async () => {
      const uploaded = await authed
        .post('/api/v1/cvs')
        .field('label', 'CV')
        .field('language', 'en')
        .attach('file', FAKE_PDF, 'cv.pdf')
        .expect(201);

      const res = await authed
        .get(`/api/v1/cvs/${uploaded.body._id}/file`)
        .expect(200);
      expect(Buffer.from(res.body as Buffer).equals(FAKE_PDF)).toBe(true);
      expect(res.headers['content-type']).toBe('application/pdf');
    });

    it("404s for another user's CV (negative case — ownership check)", async () => {
      const uploaded = await authed
        .post('/api/v1/cvs')
        .field('label', 'CV')
        .field('language', 'en')
        .attach('file', FAKE_PDF, 'cv.pdf')
        .expect(201);

      const other = await registerUser(app);
      await request(app.getHttpServer())
        .get(`/api/v1/cvs/${uploaded.body._id}/file`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });
  });

  describe('DELETE /cvs/:id', () => {
    it('deletes the CV and its stored file (happy path)', async () => {
      const uploaded = await authed
        .post('/api/v1/cvs')
        .field('label', 'CV')
        .field('language', 'en')
        .attach('file', FAKE_PDF, 'cv.pdf')
        .expect(201);

      await authed.delete(`/api/v1/cvs/${uploaded.body._id}`).expect(200);

      const list = await authed.get('/api/v1/cvs').expect(200);
      expect(list.body).toHaveLength(0);
    });

    it('404s deleting a CV that does not exist (edge case)', async () => {
      await authed.delete('/api/v1/cvs/507f1f77bcf86cd799439011').expect(404);
    });
  });
});
