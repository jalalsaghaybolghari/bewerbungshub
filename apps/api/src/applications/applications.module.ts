import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Application, ApplicationSchema } from './schemas/application.schema';
import { Event, EventSchema } from './schemas/event.schema';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { InterviewsModule } from '../interviews/interviews.module';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Application.name, schema: ApplicationSchema },
      { name: Event.name, schema: EventSchema },
    ]),
    InterviewsModule,
    FollowUpsModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
