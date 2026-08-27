import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  displayName: string;

  @Prop({ type: String, enum: ['de', 'en'], default: 'en' })
  locale: 'de' | 'en';

  // Hash of the current refresh token (never the raw token). Cleared on
  // logout; replaced on every refresh (rotation).
  @Prop()
  refreshTokenHash?: string;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
