import { z } from 'zod';

export const approvalStatusValues = ['pending', 'approved'] as const;
export const approvalStatusSchema = z.enum(approvalStatusValues);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  approvalStatus: approvalStatusSchema.optional(),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const adminUserSummarySchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  locale: z.enum(['de', 'en']),
  emailVerified: z.boolean(),
  isAdmin: z.boolean(),
  isLocked: z.boolean(),
  approvalStatus: approvalStatusSchema,
  hasApiKey: z.boolean(),
  createdAt: z.coerce.date(),
  applicationCount: z.number().int(),
  cvCount: z.number().int(),
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminSettingsSchema = z.object({
  autoApproveRegistrations: z.boolean(),
});
export type AdminSettings = z.infer<typeof adminSettingsSchema>;

export const updateAdminSettingsSchema = z.object({
  autoApproveRegistrations: z.boolean(),
});
export type UpdateAdminSettingsInput = z.infer<typeof updateAdminSettingsSchema>;

export const adminUsersListResponseSchema = z.object({
  items: z.array(adminUserSummarySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AdminUsersListResponse = z.infer<typeof adminUsersListResponseSchema>;

// Deliberately just flat counts, no time series — matches how simple the
// existing per-user dashboard stats already are, no need to over-build a
// system-wide version.
export const adminStatsSchema = z.object({
  totalUsers: z.number().int(),
  verifiedUsers: z.number().int(),
  adminUsers: z.number().int(),
  totalApplications: z.number().int(),
  totalCvs: z.number().int(),
  newUsersLast7Days: z.number().int(),
});
export type AdminStats = z.infer<typeof adminStatsSchema>;
