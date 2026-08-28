import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { interviewOutcomeValues, interviewTypeValues } from '@bewerber/shared';

@Schema({ _id: false })
class Interviewer {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  role?: string;

  @Prop()
  email?: string;
}

@Schema({ timestamps: true })
export class Interview {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, index: true })
  applicationId: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  round: number;

  @Prop({ required: true, type: String, enum: interviewTypeValues })
  type: (typeof interviewTypeValues)[number];

  @Prop({ required: true })
  scheduledAt: Date;

  @Prop()
  durationMinutes?: number;

  @Prop({ type: [Interviewer], default: [] })
  interviewers: Interviewer[];

  @Prop()
  meetingUrl?: string;

  @Prop()
  location?: string;

  @Prop({
    required: true,
    type: String,
    enum: interviewOutcomeValues,
    default: 'pending',
  })
  outcome: (typeof interviewOutcomeValues)[number];

  @Prop()
  prepNotes?: string;

  @Prop()
  feedbackNotes?: string;
}

export type InterviewDocument = HydratedDocument<Interview>;
export const InterviewSchema = SchemaFactory.createForClass(Interview);

InterviewSchema.index({ applicationId: 1, scheduledAt: 1 });
