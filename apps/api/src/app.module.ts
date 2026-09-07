import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { join } from 'node:path';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CvsModule } from './cvs/cvs.module';
import { ApplicationsModule } from './applications/applications.module';
import { GoogleDriveModule } from './google-drive/google-drive.module';
import { AdminModule } from './admin/admin.module';
import { GmailModule } from './gmail/gmail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // .env lives at the monorepo root (one file for the whole app), not
      // apps/api/ — but Turborepo runs `nest start` with cwd=apps/api, which
      // is where @nestjs/config looks by default.
      envFilePath: join(__dirname, '../../../.env'),
    }),
    ScheduleModule.forRoot(),
    // One shared Redis connection for every BullMQ queue in the app —
    // currently just gmail-sync (see GmailModule).
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redis.url') },
      }),
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    CvsModule,
    ApplicationsModule,
    GoogleDriveModule,
    AdminModule,
    GmailModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class AppModule {}
