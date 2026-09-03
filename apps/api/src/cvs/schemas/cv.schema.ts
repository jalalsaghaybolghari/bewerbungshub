import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Cv {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true, type: String, enum: ['de', 'en'] })
  language: 'de' | 'en';

  // Opaque storage-provider key — an app-internal path/S3 key for
  // 'app', or the Drive file id for 'google-drive'. Drive file ids are
  // globally unique, so this stays a safe unique index either way.
  @Prop({ required: true, unique: true })
  fileKey: string;

  @Prop({ type: String, enum: ['app', 'google-drive'], default: 'app' })
  storageProvider: 'app' | 'google-drive';

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  sizeBytes: number;

  @Prop({ default: false })
  isDefault: boolean;

  // Set when opening a Google Drive-backed file finds it's gone (e.g. the
  // user deleted it directly in Drive, outside the app) — undefined means
  // still attached. Detected reactively on open, not checked proactively.
  @Prop()
  unattachedAt?: Date;

  // Populated by the CV parsing pipeline (Phase 7) — empty until then.
  @Prop({ default: '' })
  parsedText: string;
}

export type CvDocument = HydratedDocument<Cv>;
export const CvSchema = SchemaFactory.createForClass(Cv);
