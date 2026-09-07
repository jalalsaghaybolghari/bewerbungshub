import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  approvalStatusValues,
  gmailSyncIntervalMinutesValues,
} from '@bewerber/shared';

@Schema({ _id: false })
class UserSettings {
  @Prop({ default: 7 })
  followUpDefaultDays: number;

  @Prop({ default: 21 })
  ghostedAfterDays: number;

  @Prop({ enum: gmailSyncIntervalMinutesValues, default: 60 })
  gmailSyncIntervalMinutes: number;

  @Prop({ default: false })
  gmailAutoApprove: boolean;
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

// Unlike Drive, this connection is actively polled (see GmailSyncService) —
// the extra fields below track that polling loop's own state, not just the
// OAuth grant itself.
@Schema({ _id: false })
class GmailConnection {
  @Prop({ required: true })
  accessTokenEncrypted: string;

  @Prop({ required: true })
  refreshTokenEncrypted: string;

  @Prop({ required: true })
  accessTokenExpiresAt: Date;

  @Prop({ required: true, default: Date.now })
  connectedAt: Date;

  // Undefined until the first sync completes — GmailSyncService falls back
  // to (connectedAt - a fixed backfill window) for the first run's `after:`
  // bound when this is unset.
  @Prop()
  lastSyncedAt?: Date;

  // Drives GmailSyncDispatcherService's due-user query. Always advanced at
  // the end of every sync attempt, success or failure, to
  // now + settings.gmailSyncIntervalMinutes — never left in the past by a
  // stuck or errored job, which would otherwise cause the dispatcher to
  // keep re-enqueueing it every tick.
  @Prop({ required: true, index: true })
  nextSyncAt: Date;

  @Prop({ type: String, enum: ['ok', 'error'] })
  lastSyncStatus?: 'ok' | 'error';

  @Prop()
  lastSyncError?: string;

  // Set on an invalid_grant / revoked-refresh-token failure (Google's
  // Testing-mode consent expires a refresh token after 7 days of
  // inactivity — a known, expected occurrence, not a bug). Excludes the
  // user from the dispatcher's due-user query until they reconnect, so a
  // permanently-broken connection isn't retried forever.
  @Prop({ default: false })
  needsReconnect: boolean;
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

  @Prop({ type: GmailConnection })
  gmail?: GmailConnection;

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

  // No self-service unlock — see AuthService.login/refresh/validateApiKey
  // for the three places a locked account is rejected, and
  // AdminService.setUserLocked for the only way to flip this.
  @Prop({ default: false })
  isLocked: boolean;

  // 'approved' is the default so every user created before this field
  // existed reads as approved on the next fetch (Mongoose applies schema
  // defaults to documents missing the field, same zero-migration pattern
  // as isAdmin above). Only ever created as 'pending' by AuthService.register
  // when the global auto-approve setting is off — see SystemSettingsService.
  @Prop({ type: String, enum: approvalStatusValues, default: 'approved' })
  approvalStatus: (typeof approvalStatusValues)[number];
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
