import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface RegisteredUser {
  accessToken: string;
  refreshCookie: string;
  userId: string;
  email: string;
}

let counter = 0;

export async function registerUser(
  app: INestApplication,
  overrides: Partial<{
    email: string;
    password: string;
    displayName: string;
  }> = {},
): Promise<RegisteredUser> {
  counter += 1;
  const email = overrides.email ?? `user${counter}-${Date.now()}@example.com`;
  const password = overrides.password ?? 'correct horse battery staple';
  const displayName = overrides.displayName ?? 'Test User';

  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password, displayName })
    .expect(201);

  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const refreshCookie = setCookie.find((c) => c.startsWith('refresh_token='))!;

  return {
    accessToken: res.body.accessToken as string,
    refreshCookie,
    userId: res.body.user.id as string,
    email,
  };
}
