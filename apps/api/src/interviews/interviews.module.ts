import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Application,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import { Interview, InterviewSchema } from './schemas/interview.schema';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Interview.name, schema: InterviewSchema },
      { name: Application.name, schema: ApplicationSchema },
    ]),
  ],
  controllers: [InterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService, MongooseModule],
})
export class InterviewsModule {}
