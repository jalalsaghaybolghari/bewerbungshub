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
  'ams',
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
  // The job posting's own page URL — distinct from `applyLink`, which can
  // point somewhere else entirely (e.g. LinkedIn's Easy Apply flows carry
  // a genuine external "Apply on company website" link, at which point
  // the LinkedIn job page itself would otherwise never get saved
  // anywhere). Set by the extension from the captured tab's URL; optional
  // since a manually-created application has no browser tab to capture.
  sourceUrl: z.string().url().optional(),
  cvId: z.string().optional(),
  status: applicationStatusSchema.optional().default('applied'),
  tags: z.array(z.string().max(60)).max(20).optional().default([]),
  notes: z.string().max(5000).optional(),
  favorite: z.boolean().optional().default(false),
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
  // Only ever narrows to favorites when explicitly true — omitted (or
  // false) shows everything, matching how `status`/`applyType` already
  // behave as opt-in filters rather than a three-state toggle.
  favorite: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  // 500 (not 100) so the Kanban board's "fetch everything, group client-side
  // by status" query (apps/web/src/applications/KanbanBoard.tsx) fits under
  // the cap — the list view's own pagination still uses a much smaller size.
  pageSize: z.coerce.number().int().min(1).max(500).optional().default(20),
  sort: z
    .enum([
      'sentAt',
      '-sentAt',
      'jobTitle',
      '-jobTitle',
      'statusChangedAt',
      '-statusChangedAt',
      'createdAt',
      '-createdAt',
      // 'location.raw'/'applyType'/'postedAt' back the list table's
      // sortable Location/Channel/Posted column headers.
      'location.raw',
      '-location.raw',
      'applyType',
      '-applyType',
      'postedAt',
      '-postedAt',
    ])
    .optional()
    // Newest-captured first by default — most recently added applications
    // are what a user coming back to the list wants to see, not sorted by
    // sentAt (which stays undefined for drafts, so those would otherwise
    // sort inconsistently against sent ones).
    .default('-createdAt'),
});
export type ApplicationQuery = z.infer<typeof applicationQuerySchema>;

// Which dimensions count toward a "likely duplicate" match in the "Find
// similar" review list — see isLikelyDuplicate in similarity.ts. All
// default to true (the original, only) behavior when none are passed.
export const duplicateGroupsQuerySchema = z.object({
  title: z.coerce.boolean().optional().default(true),
  company: z.coerce.boolean().optional().default(true),
  location: z.coerce.boolean().optional().default(true),
});
export type DuplicateGroupsQuery = z.infer<typeof duplicateGroupsQuerySchema>;
