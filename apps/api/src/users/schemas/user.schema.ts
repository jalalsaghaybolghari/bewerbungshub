import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
class UserSettings {
  @Prop({ default: 7 })
  followUpDefaultDays: number;

  @Prop({ default: 21 })
  ghostedAfterDays: number;
}

// Tokens are encrypted (TokenEncryptionService) before ever reaching here —
// never stored in plaintext. folderId is the app's dedicated "BewerbungsHub
// CVs" folder in this user's Drive, created once on first connect.
@Schema({ _id: false })
class GoogleDriveConnection {
  @Prop({ required: true })
  accessTokenEncrypted: string;

  @Prop({ required: true })
  refreshTokenEncrypted: string;

  @Prop({ required: true })
  accessTokenExpiresAt: Date;

  @Prop({ required: true })
  folderId: string;

  @Prop({ required: true, default: Date.now })
  connectedAt: Date;
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

  @Prop({ type: GoogleDriveConnection })
  googleDrive?: GoogleDriveConnection;

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

  // SHA-256 hex digest of the raw key, not argon2 — a high-entropy random
  // key doesn't need slow password-style hashing, and a plain fast hash
  // is what makes "which user does this key belong to" a single indexed
  // lookup (findByApiKeyHash) instead of iterating every user's hash to
  // argon2.verify against each one. One active key per user; generating a
  // new one silently replaces the old (see AuthService.generateApiKey).
  @Prop()
  apiKeyHash?: string;

  @Prop()
  apiKeyCreatedAt?: Date;

  // No self-service UI to grant this yet — set via a direct DB update.
  // See AdminGuard for how it gates /admin/* routes.
  @Prop({ default: false })
  isAdmin: boolean;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

// Sparse-equivalent via partialFilterExpression rather than `sparse: true`
// — see the identical reasoning on Application's applyLinkDedupeKey index
// (apps/api/src/applications/schemas/application.schema.ts): a `sparse`
// index on its own only skips a document if *every* indexed field is
// missing, and here there's just the one field, so sparse would actually
// have worked — but $exists keeps both index definitions in this codebase
// consistent, and guards against ever adding a second field to this index
// later without re-deriving the gotcha from scratch.
UserSchema.index(
  { apiKeyHash: 1 },
  { unique: true, partialFilterExpression: { apiKeyHash: { $exists: true } } },
);
