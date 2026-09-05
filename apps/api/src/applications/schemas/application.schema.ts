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
class RelatedLink {
  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true })
  url: string;
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

  // Mirrors applyLink, but only set when applyType isn't 'email' — see the
  // sparse-index comment near the bottom of this file for why this exists
  // as a separate field instead of indexing applyLink directly.
  @Prop()
  applyLinkDedupeKey?: string;

  // The job posting's own page URL, distinct from applyLink — see the
  // comment on createApplicationSchema in packages/shared.
  @Prop()
  sourceUrl?: string;

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

  // No default — this must reflect when the application actually left
  // 'draft' (either at creation, if created with a later status, or via a
  // status change), never just when the record was created. See
  // ApplicationsService.create/changeStatus.
  @Prop()
  sentAt?: Date;

  @Prop()
  postedAt?: Date;

  @Prop()
  nextFollowUpAt?: Date;

  @Prop({ default: 0 })
  followUpCount: number;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [RelatedLink], default: [] })
  relatedLinks: RelatedLink[];

  @Prop()
  notes?: string;

  @Prop({ default: false })
  favorite: boolean;

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
ApplicationSchema.index({ userId: 1, favorite: 1 });
// A URL genuinely identifies one posting, but the same email address (a
// generic jobs@company.com, a recruiter's inbox) is often the legitimate
// apply channel for several different, unrelated postings — so it
// shouldn't be treated as a duplicate signal. Two things had to be worked
// around to express "unique except when applyType is 'email'":
// (1) partial-index filter expressions only support equality/$exists/
// comparison operators, not $ne/$in/$or, so the exclusion is expressed via
// a derived field (applyLinkDedupeKey, set by ApplicationsService only
// when applyType !== 'email') instead of filtering on applyType directly.
// (2) `sparse: true` looks like the natural way to skip documents missing
// that field, but for a *compound* index sparse only skips a document if
// ALL of its fields are missing — since userId is always present, sparse
// alone still indexes the missing field as `null` and enforces uniqueness
// on that. `partialFilterExpression: { field: { $exists: true } }` is the
// actual fix: it excludes a document if that one field is absent,
// regardless of what else is on it.
ApplicationSchema.index(
  { userId: 1, applyLinkDedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { applyLinkDedupeKey: { $exists: true } },
  },
);
ApplicationSchema.index({
  jobTitle: 'text',
  'company.name': 'text',
  jobDescription: 'text',
});
