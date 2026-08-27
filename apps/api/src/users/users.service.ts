import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
