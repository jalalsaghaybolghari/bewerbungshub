import { z } from 'zod';
import { queryStringBoolean } from './applications';

export const cvLanguageSchema = z.enum(['de', 'en']);
export type CvLanguage = z.infer<typeof cvLanguageSchema>;

export const createCvMetadataSchema = z.object({
  label: z.string().min(1).max(200),
  language: cvLanguageSchema,
  // These arrive as FormData string values ('true'/'false'), same as a
  // query param — z.coerce.boolean() would be wrong here for the same
  // reason it's wrong for query params (see queryStringBoolean's comment
  // in applications.ts): Boolean("false") is true.
  isDefault: z.preprocess(queryStringBoolean, z.boolean().optional().default(false)),
  // Opt-in per upload, not a global "everything goes to Drive" switch —
  // requires the user to already have an active Google Drive connection;
  // the API rejects this as a 400 otherwise.
  useGoogleDrive: z.preprocess(queryStringBoolean, z.boolean().optional().default(false)),
});
export type CreateCvMetadataInput = z.infer<typeof createCvMetadataSchema>;

export const updateCvSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateCvInput = z.infer<typeof updateCvSchema>;

export const ALLOWED_CV_MIME_TYPES = ['application/pdf'] as const;
export const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB, per the plan's PDF size ceiling
