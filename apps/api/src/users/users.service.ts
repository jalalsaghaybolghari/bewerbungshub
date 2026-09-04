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
}
