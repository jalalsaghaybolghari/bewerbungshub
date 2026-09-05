import { Model } from 'mongoose';
import { SystemSettingsService } from './system-settings.service';
import {
  SYSTEM_SETTINGS_ID,
  SystemSettingsDocument,
} from './schemas/system-settings.schema';

function makeModel() {
  return {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
}

describe('SystemSettingsService', () => {
  let model: ReturnType<typeof makeModel>;
  let service: SystemSettingsService;

  beforeEach(() => {
    model = makeModel();
    service = new SystemSettingsService(
      model as unknown as Model<SystemSettingsDocument>,
    );
  });

  describe('getAutoApprove', () => {
    it('returns the stored value when the singleton document exists (happy path)', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ autoApproveRegistrations: false }),
      });

      const result = await service.getAutoApprove();

      expect(model.findOne).toHaveBeenCalledWith({ _id: SYSTEM_SETTINGS_ID });
      expect(result).toBe(false);
    });

    it('defaults to true when no document has ever been created yet (edge case)', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.getAutoApprove();

      expect(result).toBe(true);
    });
  });

  describe('setAutoApprove', () => {
    it('upserts the singleton document with the new value (happy path)', async () => {
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(undefined),
      });

      await service.setAutoApprove(false);

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: SYSTEM_SETTINGS_ID },
        { $set: { autoApproveRegistrations: false } },
        { upsert: true, setDefaultsOnInsert: true },
      );
    });
  });
});
