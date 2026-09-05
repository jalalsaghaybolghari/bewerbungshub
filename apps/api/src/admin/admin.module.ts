import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Application,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import { Event, EventSchema } from '../applications/schemas/event.schema';
import { Cv, CvSchema } from '../cvs/schemas/cv.schema';
import { UsersModule } from '../users/users.module';
import { CvsModule } from '../cvs/cvs.module';
import { InterviewsModule } from '../interviews/interviews.module';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';

@Module({
  imports: [
    // Registered directly (not reached via ApplicationsModule/CvsModule's
    // own exports) for AdminService's raw-model needs — the same
    // duplicate-registration pattern InterviewsModule/FollowUpsModule
    // already use for the Application schema.
    MongooseModule.forFeature([
      { name: Application.name, schema: ApplicationSchema },
      { name: Cv.name, schema: CvSchema },
      { name: Event.name, schema: EventSchema },
    ]),
    UsersModule,
    CvsModule,
    InterviewsModule,
    FollowUpsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
