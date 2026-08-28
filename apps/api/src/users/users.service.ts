import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { UpdateUserSettingsInput } from '@bewerber/shared';
import { User, UserDocument } from './schemas/user.schema';

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
}
