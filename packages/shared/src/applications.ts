import { z } from 'zod';

export const applicationStatusValues = [
  'draft',
  'applied',
  'acknowledged',
  'screening',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
  'ghosted',
] as const;
export const applicationStatusSchema = z.enum(applicationStatusValues);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

// Statuses a user (or the system) can never move an application out of once set.
export const terminalApplicationStatuses = [
  'accepted',
  'rejected',
  'withdrawn',
  'ghosted',
] as const satisfies readonly ApplicationStatus[];

export const applyTypeValues = [
  'linkedin',
  'xing',
  'stepstone',
  'indeed',
  'email',
  'website',
  'referral',
  'other',
] as const;
export const applyTypeSchema = z.enum(applyTypeValues);
export type ApplyType = z.infer<typeof applyTypeSchema>;

export const remoteTypeValues = ['onsite', 'hybrid', 'remote'] as const;
export const remoteTypeSchema = z.enum(remoteTypeValues);
export type RemoteType = z.infer<typeof remoteTypeSchema>;

export const companySchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().url().optional(),
  domain: z.string().max(200).optional(),
});

export const locationSchema = z.object({
  raw: z.string().min(1).max(200),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  remoteType: remoteTypeSchema.optional(),
});

export const createApplicationSchema = z.object({
  jobTitle: z.string().min(1).max(200),
  company: companySchema,
  location: locationSchema,
  jobDescription: z.string().min(1),
  applyLink: z.string().url(),
  applyType: applyTypeSchema,
  cvId: z.string().optional(),
  status: applicationStatusSchema.optional().default('applied'),
  tags: z.array(z.string().max(60)).max(20).optional().default([]),
  notes: z.string().max(5000).optional(),
  // When the employer posted (or reposted) the listing — distinct from
  // `sentAt` (when the user applied). Not every source can find this, so
  // it's optional rather than defaulted.
  postedAt: z.coerce.date().optional(),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const updateApplicationSchema = createApplicationSchema.partial();
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

export const changeApplicationStatusSchema = z.object({
  status: applicationStatusSchema,
  note: z.string().max(2000).optional(),
});
export type ChangeApplicationStatusInput = z.infer<typeof changeApplicationStatusSchema>;

export const applicationQuerySchema = z.object({
  status: applicationStatusSchema.optional(),
  applyType: applyTypeSchema.optional(),
  q: z.string().max(200).optional(),
  tag: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  // 500 (not 100) so the Kanban board's "fetch everything, group client-side
  // by status" query (apps/web/src/applications/KanbanBoard.tsx) fits under
  // the cap — the list view's own pagination still uses a much smaller size.
  pageSize: z.coerce.number().int().min(1).max(500).optional().default(20),
  sort: z
    .enum(['sentAt', '-sentAt', 'jobTitle', '-jobTitle', 'statusChangedAt', '-statusChangedAt'])
    .optional()
    .default('-sentAt'),
});
export type ApplicationQuery = z.infer<typeof applicationQuerySchema>;
