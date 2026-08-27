import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { rm } from 'node:fs/promises';
import { AppModule } from '../../src/app.module';

export interface TestAppContext {
  app: INestApplication;
  mongo: MongoMemoryServer;
  uploadsDir: string;
}

/**
 * Boots a full Nest app (same global setup as main.ts) against an in-memory
 * MongoDB instance and a scratch local-fs upload dir — no Docker/Atlas/MinIO
 * needed to run the e2e suite.
 */
export async function createTestApp(): Promise<TestAppContext> {
  const mongo = await MongoMemoryServer.create();
  const uploadsDir = `./.tmp-test-uploads/${Date.now()}-${Math.random().toString(36).slice(2)}`;

  process.env.MONGO_URI = mongo.getUri();
  process.env.STORAGE_DRIVER = 'local';
  process.env.STORAGE_LOCAL_DIR = uploadsDir;
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = '30d';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', { exclude: ['/', 'health'] });
  await app.init();

  return { app, mongo, uploadsDir };
}

export async function closeTestApp({
  app,
  mongo,
  uploadsDir,
}: TestAppContext): Promise<void> {
  await app.close();
  await mongo.stop();
  await rm(uploadsDir, { recursive: true, force: true });
}
