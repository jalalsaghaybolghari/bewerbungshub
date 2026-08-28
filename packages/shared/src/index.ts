import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from './auth';
export * from './applications';
export * from './cvs';
export * from './interviews';
export * from './follow-ups';
export * from './settings';
