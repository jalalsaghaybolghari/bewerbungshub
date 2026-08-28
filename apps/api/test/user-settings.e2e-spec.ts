import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp, TestAppContext } from './utils/test-app';
import { registerUser, RegisteredUser } from './utils/auth';

describe('User settings (e2e)', () => {
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

  it('returns sensible defaults for a new user (happy path)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      followUpDefaultDays: 7,
      ghostedAfterDays: 21,
    });
  });

  it('updates a single setting without resetting the other (edge case)', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ ghostedAfterDays: 30 })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      followUpDefaultDays: 7,
      ghostedAfterDays: 30,
    });
  });

  it('rejects an out-of-range value (negative case)', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ ghostedAfterDays: 9999 })
      .expect(400);
  });

  it('rejects an unauthenticated request (negative case)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/me/settings')
      .expect(401);
  });
});
