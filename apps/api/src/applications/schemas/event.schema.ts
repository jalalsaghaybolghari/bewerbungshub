import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const eventTypeValues = ['created', 'status_changed', 'note'] as const;

@Schema({ timestamps: false })
export class Event {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  applicationId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: eventTypeValues })
  type: (typeof eventTypeValues)[number];

  @Prop({ required: true, default: Date.now })
  occurredAt: Date;

  @Prop({ type: String, enum: ['user', 'system'], default: 'user' })
  actor: 'user' | 'system';

  @Prop({ type: Object })
  payload?: Record<string, unknown>;
}

export type EventDocument = HydratedDocument<Event>;
export const EventSchema = SchemaFactory.createForClass(Event);

EventSchema.index({ applicationId: 1, occurredAt: 1 });
