import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Application,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import { FollowUp, FollowUpSchema } from './schemas/follow-up.schema';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FollowUp.name, schema: FollowUpSchema },
      { name: Application.name, schema: ApplicationSchema },
    ]),
  ],
  controllers: [FollowUpsController],
  providers: [FollowUpsService],
  exports: [FollowUpsService, MongooseModule],
})
export class FollowUpsModule {}
