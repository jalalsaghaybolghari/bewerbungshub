import { z } from 'zod';

export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const adminUserSummarySchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  locale: z.enum(['de', 'en']),
  emailVerified: z.boolean(),
  isAdmin: z.boolean(),
  createdAt: z.coerce.date(),
  applicationCount: z.number().int(),
  cvCount: z.number().int(),
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

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
