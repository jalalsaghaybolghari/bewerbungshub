import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp, TestAppContext } from './utils/test-app';
import { registerUser } from './utils/auth';

describe('Auth (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  describe('POST /auth/register', () => {
    it('creates a user and returns an access token + refresh cookie (happy path)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'alice@example.com',
          password: 'a very strong password',
          displayName: 'Alice',
        })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({
        email: 'alice@example.com',
        displayName: 'Alice',
      });
      expect(res.body.user.passwordHash).toBeUndefined();

      const setCookie = res.headers['set-cookie'] as unknown as string[];
      expect(
        setCookie.some(
          (c) => c.startsWith('refresh_token=') && c.includes('HttpOnly'),
        ),
      ).toBe(true);
    });

    it('rejects a duplicate email (negative case)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'bob@example.com',
          password: 'a very strong password',
          displayName: 'Bob',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'bob@example.com',
          password: 'another strong password',
          displayName: 'Bob 2',
        })
        .expect(409);
    });

    it('rejects a password shorter than the minimum (edge case)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'short@example.com',
          password: 'short',
          displayName: 'Shorty',
        })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with correct credentials (happy path)', async () => {
      await registerUser(app, {
        email: 'carol@example.com',
        password: 'correct horse battery staple',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'carol@example.com',
          password: 'correct horse battery staple',
        })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects the wrong password (negative case)', async () => {
      await registerUser(app, {
        email: 'dave@example.com',
        password: 'correct horse battery staple',
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'dave@example.com',
          password: 'wrong password entirely',
        })
        .expect(401);
    });

    it('rejects an email that was never registered (negative case)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever password' })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it("returns the current user's profile when authenticated (happy path)", async () => {
      const user = await registerUser(app);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ id: user.userId, email: user.email });
    });

    it('rejects a request with no token (negative case)', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('rejects a garbage bearer token (negative case)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('issues a new access token from a valid refresh cookie (happy path)', async () => {
      const user = await registerUser(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.refreshCookie)
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.accessToken).not.toBe(user.accessToken);
    });

    it('rejects a request with no refresh cookie (negative case)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .expect(401);
    });

    it('rotates the token: the previous refresh cookie stops working after use (edge case)', async () => {
      const user = await registerUser(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.refreshCookie)
        .expect(200);

      // Re-using the now-rotated-out cookie must fail.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.refreshCookie)
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it("invalidates the user's refresh token (happy path)", async () => {
      const user = await registerUser(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .set('Cookie', user.refreshCookie)
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.refreshCookie)
        .expect(401);
    });

    it('rejects logout with no access token (negative case)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(401);
    });
  });
});
