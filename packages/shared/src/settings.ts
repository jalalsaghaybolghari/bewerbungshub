import { z } from 'zod';

export const userSettingsSchema = z.object({
  followUpDefaultDays: z.number().int().min(1).max(90).default(7),
  ghostedAfterDays: z.number().int().min(1).max(365).default(21),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const updateUserSettingsSchema = z.object({
  followUpDefaultDays: z.coerce.number().int().min(1).max(90).optional(),
  ghostedAfterDays: z.coerce.number().int().min(1).max(365).optional(),
});
export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsSchema>;
