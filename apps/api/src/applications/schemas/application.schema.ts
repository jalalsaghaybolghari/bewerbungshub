import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  applicationStatusValues,
  applyTypeValues,
  remoteTypeValues,
} from '@bewerber/shared';

@Schema({ _id: false })
class Company {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  website?: string;

  @Prop()
  domain?: string;
}

@Schema({ _id: false })
class Location {
  @Prop({ required: true, trim: true })
  raw: string;

  @Prop()
  city?: string;

  @Prop()
  country?: string;

  @Prop({ type: String, enum: remoteTypeValues })
  remoteType?: (typeof remoteTypeValues)[number];
}

@Schema({ timestamps: true })
export class Application {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  jobTitle: string;

  @Prop({ required: true, type: Company })
  company: Company;

  @Prop({ required: true, type: Location })
  location: Location;

  @Prop({ required: true })
  jobDescription: string;

  @Prop({ required: true })
  applyLink: string;

  @Prop({ required: true, type: String, enum: applyTypeValues })
  applyType: (typeof applyTypeValues)[number];

  @Prop({ type: MongooseSchema.Types.ObjectId })
  cvId?: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: applicationStatusValues,
    default: 'applied',
  })
  status: (typeof applicationStatusValues)[number];

  @Prop({ required: true, default: Date.now })
  statusChangedAt: Date;

  @Prop({ type: String, enum: ['user', 'system'], default: 'user' })
  statusSetBy: 'user' | 'system';

  @Prop({ default: Date.now })
  sentAt?: Date;

  @Prop()
  postedAt?: Date;

  @Prop()
  nextFollowUpAt?: Date;

  @Prop({ default: 0 })
  followUpCount: number;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  notes?: string;

  @Prop({
    type: {
      capturedBy: { type: String, enum: ['extension', 'manual', 'import'] },
    },
    _id: false,
    default: { capturedBy: 'manual' },
  })
  source: { capturedBy: 'extension' | 'manual' | 'import' };

  @Prop()
  archivedAt?: Date;
}

export type ApplicationDocument = HydratedDocument<Application>;
export const ApplicationSchema = SchemaFactory.createForClass(Application);

ApplicationSchema.index({ userId: 1, status: 1 });
ApplicationSchema.index({ userId: 1, nextFollowUpAt: 1 });
ApplicationSchema.index({ userId: 1, applyLink: 1 }, { unique: true });
ApplicationSchema.index({
  jobTitle: 'text',
  'company.name': 'text',
  jobDescription: 'text',
});
