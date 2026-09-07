import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  applicationStatusValues,
  emailMatchClassificationValues,
  emailMatchDecisionValues,
} from '@bewerber/shared';

// One document per (userId, gmailMessageId) — the unique index below is
// both the dedupe guard (a duplicate-key error on insert means "already
// processed this message", same trick Application.applyLinkDedupeKey
// already uses) and the query index the /gmail/pending list uses.
// 'no_action' records (sender-matched but no application match, or no
// classifier signal) are still persisted here for dedupe/audit — they're
// just never surfaced in the approval UI.
@Schema({ timestamps: true })
export class EmailMatch {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, index: true })
  userId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  applicationId?: Types.ObjectId;

  @Prop({ required: true })
  gmailMessageId: string;

  @Prop()
  gmailThreadId?: string;

  @Prop({ required: true })
  fromAddress: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  snippet: string;

  @Prop({ required: true })
  receivedAt: Date;

  @Prop({ required: true, type: String, enum: emailMatchClassificationValues })
  classification: (typeof emailMatchClassificationValues)[number];

  @Prop({ required: true, type: String, enum: emailMatchDecisionValues })
  decision: (typeof emailMatchDecisionValues)[number];

  @Prop({ type: String, enum: applicationStatusValues })
  proposedStatus?: (typeof applicationStatusValues)[number];

  @Prop()
  resolvedAt?: Date;

  @Prop({ type: String, enum: ['user', 'system'] })
  resolvedBy?: 'user' | 'system';

  @Prop({ type: String, enum: ['approved', 'rejected'] })
  resolution?: 'approved' | 'rejected';

  @Prop({ type: MongooseSchema.Types.ObjectId })
  eventId?: Types.ObjectId;
}

export type EmailMatchDocument = HydratedDocument<EmailMatch>;
export const EmailMatchSchema = SchemaFactory.createForClass(EmailMatch);

EmailMatchSchema.index({ userId: 1, gmailMessageId: 1 }, { unique: true });
EmailMatchSchema.index({ userId: 1, decision: 1 });
