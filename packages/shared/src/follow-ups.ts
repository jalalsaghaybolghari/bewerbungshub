import { z } from 'zod';

export const followUpChannelValues = ['email', 'linkedin', 'phone', 'portal', 'manual'] as const;
export const followUpChannelSchema = z.enum(followUpChannelValues);
export type FollowUpChannel = z.infer<typeof followUpChannelSchema>;

export const followUpStatusValues = ['scheduled', 'sent', 'skipped', 'cancelled'] as const;
export const followUpStatusSchema = z.enum(followUpStatusValues);
export type FollowUpStatus = z.infer<typeof followUpStatusSchema>;

export const createFollowUpSchema = z.object({
  dueAt: z.coerce.date(),
  channel: followUpChannelSchema,
  messageBody: z.string().max(5000).optional(),
});
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

export const updateFollowUpSchema = z.object({
  dueAt: z.coerce.date().optional(),
  channel: followUpChannelSchema.optional(),
  messageBody: z.string().max(5000).optional(),
  status: followUpStatusSchema.optional(),
});
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;
