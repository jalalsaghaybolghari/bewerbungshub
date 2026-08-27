import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp, TestAppContext } from './utils/test-app';

describe('AppController (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('/ (GET) returns the welcome message (happy path)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET) reports ok status (happy path)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/health (POST) is not allowed (negative case)', () => {
    return request(app.getHttpServer()).post('/health').expect(404);
  });

  it('/does-not-exist (GET) 404s (edge case)', () => {
    return request(app.getHttpServer()).get('/does-not-exist').expect(404);
  });
});
