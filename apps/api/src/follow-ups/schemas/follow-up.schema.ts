import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { followUpChannelValues, followUpStatusValues } from '@bewerber/shared';

@Schema({ timestamps: true })
export class FollowUp {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  applicationId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  dueAt: Date;

  @Prop()
  sentAt?: Date;

  @Prop({ required: true, type: String, enum: followUpChannelValues })
  channel: (typeof followUpChannelValues)[number];

  @Prop()
  messageBody?: string;

  @Prop({
    required: true,
    type: String,
    enum: followUpStatusValues,
    default: 'scheduled',
  })
  status: (typeof followUpStatusValues)[number];
}

export type FollowUpDocument = HydratedDocument<FollowUp>;
export const FollowUpSchema = SchemaFactory.createForClass(FollowUp);

FollowUpSchema.index({ applicationId: 1, dueAt: 1 });
