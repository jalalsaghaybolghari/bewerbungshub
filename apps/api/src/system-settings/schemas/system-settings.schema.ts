import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// Singleton document — always read/written via this fixed _id, never
// queried any other way. Using a known _id (rather than relying on "only
// ever one doc exists" as an unenforced invariant) makes every access a
// race-safe upsert and lets the collection self-create with defaults on
// first use, no seed script needed.
export const SYSTEM_SETTINGS_ID = 'global';

@Schema({ timestamps: true })
export class SystemSettings {
  // Overrides Mongoose's default ObjectId _id with a fixed string, so the
  // singleton document can be addressed by SYSTEM_SETTINGS_ID directly
  // (an upsert against a plain-string _id would otherwise fail to cast).
  @Prop({ type: String, default: SYSTEM_SETTINGS_ID })
  _id: string;

  // Whether a new registration sends the verification code immediately
  // (true, today's behavior) or sits as 'pending' until an admin approves
  // it (see AuthService.register / approveAndSendCode).
  @Prop({ default: true })
  autoApproveRegistrations: boolean;
}

export type SystemSettingsDocument = HydratedDocument<SystemSettings>;
export const SystemSettingsSchema =
  SchemaFactory.createForClass(SystemSettings);
