import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
class UserSettings {
  @Prop({ default: 7 })
  followUpDefaultDays: number;

  @Prop({ default: 21 })
  ghostedAfterDays: number;
}

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

  @Prop({ type: UserSettings, default: {} })
  settings: UserSettings;

  // Hash of the current refresh token (never the raw token). Cleared on
  // logout; replaced on every refresh (rotation).
  @Prop()
  refreshTokenHash?: string;

  // An unverified account never receives a session (see AuthService) —
  // register() creates the user with this false and no tokens; only a
  // successful confirm-email flips it. Code is hashed (never stored
  // plain), same mechanism as refreshTokenHash above.
  @Prop({ default: false })
  emailVerified: boolean;

  @Prop()
  emailVerificationCodeHash?: string;

  @Prop()
  emailVerificationCodeExpiresAt?: Date;

  @Prop({ default: 0 })
  emailVerificationAttempts: number;

  // Powers the resend cooldown — see AuthService.resendCode.
  @Prop()
  emailVerificationLastSentAt?: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
