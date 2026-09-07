import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { UsersModule } from '../users/users.module';
import { ApplicationsModule } from '../applications/applications.module';
import { TokenEncryptionService } from '../common/token-encryption.service';
import {
  Application,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import { Event, EventSchema } from '../applications/schemas/event.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { GmailController } from './gmail.controller';
import { GmailService } from './gmail.service';
import { GmailSyncService } from './gmail-sync.service';
import { GmailSyncProcessor } from './gmail-sync.processor';
import { GmailSyncDispatcherService } from './gmail-sync-dispatcher.service';
import { EmailMatchService } from './email-match.service';
import { EmailMatch, EmailMatchSchema } from './schemas/email-match.schema';

@Module({
  imports: [
    UsersModule,
    // For EmailMatchService.approve's delegation to
    // ApplicationsService.changeStatus.
    ApplicationsModule,
    JwtModule.register({}),
    BullModule.registerQueue({ name: 'gmail-sync' }),
    // Registered directly (not just via ApplicationsModule's own exports)
    // for GmailSyncService/EmailMatchService's raw-model needs — the same
    // duplicate-registration pattern InterviewsModule/FollowUpsModule/
    // AdminModule already use for the Application schema.
    MongooseModule.forFeature([
      { name: Application.name, schema: ApplicationSchema },
      { name: Event.name, schema: EventSchema },
      { name: User.name, schema: UserSchema },
      { name: EmailMatch.name, schema: EmailMatchSchema },
    ]),
  ],
  controllers: [GmailController],
  providers: [
    GmailService,
    TokenEncryptionService,
    GmailSyncService,
    GmailSyncProcessor,
    GmailSyncDispatcherService,
    EmailMatchService,
  ],
  exports: [GmailService],
})
export class GmailModule {}
