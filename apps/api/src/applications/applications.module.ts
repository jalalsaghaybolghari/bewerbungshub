import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Application, ApplicationSchema } from './schemas/application.schema';
import { Event, EventSchema } from './schemas/event.schema';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationsCronService } from './applications-cron.service';
import { InterviewsModule } from '../interviews/interviews.module';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Application.name, schema: ApplicationSchema },
      { name: Event.name, schema: EventSchema },
      { name: User.name, schema: UserSchema },
    ]),
    InterviewsModule,
    FollowUpsModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationsCronService],
  exports: [ApplicationsService, ApplicationsCronService],
})
export class ApplicationsModule {}
