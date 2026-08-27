import { z } from 'zod';

export const cvLanguageSchema = z.enum(['de', 'en']);
export type CvLanguage = z.infer<typeof cvLanguageSchema>;

export const createCvMetadataSchema = z.object({
  label: z.string().min(1).max(200),
  language: cvLanguageSchema,
  isDefault: z.coerce.boolean().optional().default(false),
});
export type CreateCvMetadataInput = z.infer<typeof createCvMetadataSchema>;

export const updateCvSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateCvInput = z.infer<typeof updateCvSchema>;

export const ALLOWED_CV_MIME_TYPES = ['application/pdf'] as const;
export const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB, per the plan's PDF size ceiling
