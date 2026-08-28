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

  @Prop({ required: true, unique: true })
  fileKey: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  sizeBytes: number;

  @Prop({ default: false })
  isDefault: boolean;

  // Populated by the CV parsing pipeline (Phase 7) — empty until then.
  @Prop({ default: '' })
  parsedText: string;
}

export type CvDocument = HydratedDocument<Cv>;
export const CvSchema = SchemaFactory.createForClass(Cv);
