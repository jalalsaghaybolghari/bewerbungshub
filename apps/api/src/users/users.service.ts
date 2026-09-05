import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { UpdateUserSettingsInput } from '@bewerber/shared';
import { User, UserDocument } from './schemas/user.schema';

export interface GoogleDriveConnectionInput {
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt: Date;
  folderId: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  create(data: { email: string; passwordHash: string; displayName: string }) {
    return this.userModel.create(data);
  }

  async updateSettings(userId: string, input: UpdateUserSettingsInput) {
    const update: Record<string, number> = {};
    if (input.followUpDefaultDays !== undefined) {
      update['settings.followUpDefaultDays'] = input.followUpDefaultDays;
    }
    if (input.ghostedAfterDays !== undefined) {
      update['settings.ghostedAfterDays'] = input.ghostedAfterDays;
    }
    return this.userModel
      .findByIdAndUpdate(userId, { $set: update }, { new: true })
      .exec();
  }

  setRefreshTokenHash(userId: string, refreshTokenHash: string | undefined) {
    // Mongoose drops keys whose value is `undefined` from a `$set`-style
    // update instead of clearing them — logout must use `$unset` explicitly.
    const update =
      refreshTokenHash !== undefined
        ? { $set: { refreshTokenHash } }
        : { $unset: { refreshTokenHash: '' } };
    return this.userModel.updateOne({ _id: userId }, update).exec();
  }

  setGoogleDriveConnection(
    userId: string,
    connection: GoogleDriveConnectionInput,
  ) {
    return this.userModel
      .updateOne(
        { _id: userId },
        { $set: { googleDrive: { ...connection, connectedAt: new Date() } } },
      )
      .exec();
  }

  // Only the access token + its expiry rotate on refresh — folderId and
  // connectedAt are set once at connect time and never touched again.
  updateGoogleDriveAccessToken(
    userId: string,
    accessTokenEncrypted: string,
    accessTokenExpiresAt: Date,
  ) {
    return this.userModel
      .updateOne(
        { _id: userId },
        {
          $set: {
            'googleDrive.accessTokenEncrypted': accessTokenEncrypted,
            'googleDrive.accessTokenExpiresAt': accessTokenExpiresAt,
          },
        },
      )
      .exec();
  }

  clearGoogleDriveConnection(userId: string) {
    return this.userModel
      .updateOne({ _id: userId }, { $unset: { googleDrive: '' } })
      .exec();
  }

  // Used by both the initial register() send and every resend — resets
  // attempts and stamps lastSentAt so a fresh code always gets its own
  // full attempt budget and cooldown window.
  setEmailVerificationCode(userId: string, codeHash: string, expiresAt: Date) {
    return this.userModel
      .updateOne(
        { _id: userId },
        {
          $set: {
            emailVerificationCodeHash: codeHash,
            emailVerificationCodeExpiresAt: expiresAt,
            emailVerificationAttempts: 0,
            emailVerificationLastSentAt: new Date(),
          },
        },
      )
      .exec();
  }

  incrementEmailVerificationAttempts(userId: string) {
    return this.userModel
      .updateOne({ _id: userId }, { $inc: { emailVerificationAttempts: 1 } })
      .exec();
  }

  markEmailVerified(userId: string) {
    return this.userModel
      .updateOne(
        { _id: userId },
        {
          $set: { emailVerified: true },
          $unset: {
            emailVerificationCodeHash: '',
            emailVerificationCodeExpiresAt: '',
            emailVerificationAttempts: '',
            emailVerificationLastSentAt: '',
          },
        },
      )
      .exec();
  }

  // Used when a code expires or attempts are exhausted — clears just the
  // code itself (not emailVerified/lastSentAt) so the account is left
  // needing a resend, not silently re-verified or freed from the cooldown.
  invalidateEmailVerificationCode(userId: string) {
    return this.userModel
      .updateOne(
        { _id: userId },
        {
          $unset: {
            emailVerificationCodeHash: '',
            emailVerificationCodeExpiresAt: '',
          },
        },
      )
      .exec();
  }

  // Generating a new key silently replaces any existing one — there's
  // only ever one active key per user, matching the plain "personal
  // access token" UX (regenerate invalidates the old one automatically).
  setApiKeyHash(userId: string, apiKeyHash: string) {
    return this.userModel
      .updateOne(
        { _id: userId },
        { $set: { apiKeyHash, apiKeyCreatedAt: new Date() } },
      )
      .exec();
  }

  clearApiKeyHash(userId: string) {
    return this.userModel
      .updateOne(
        { _id: userId },
        { $unset: { apiKeyHash: '', apiKeyCreatedAt: '' } },
      )
      .exec();
  }

  // The hash (not the raw key) is looked up directly — see the comment on
  // User.apiKeyHash for why a fast deterministic hash makes this a single
  // indexed query instead of an argon2.verify loop over every user.
  findByApiKeyHash(apiKeyHash: string) {
    return this.userModel.findOne({ apiKeyHash }).exec();
  }

  // Used only by AdminService.deleteUser's cascade, and only after every
  // other collection has already been cleaned up for this user.
  deleteById(userId: string) {
    return this.userModel.deleteOne({ _id: userId }).exec();
  }
}
