import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SYSTEM_SETTINGS_ID,
  SystemSettings,
  SystemSettingsDocument,
} from './schemas/system-settings.schema';

@Injectable()
export class SystemSettingsService {
  constructor(
    @InjectModel(SystemSettings.name)
    private readonly model: Model<SystemSettingsDocument>,
  ) {}

  async getAutoApprove(): Promise<boolean> {
    const doc = await this.model.findOne({ _id: SYSTEM_SETTINGS_ID }).exec();
    // Schema default applies even if the singleton doc doesn't exist yet
    // (first-ever call, fresh deploy) — no seed step needed.
    return doc?.autoApproveRegistrations ?? true;
  }

  async setAutoApprove(enabled: boolean): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { _id: SYSTEM_SETTINGS_ID },
        { $set: { autoApproveRegistrations: enabled } },
        { upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }
}
