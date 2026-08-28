import { z } from 'zod';

export const interviewTypeValues = [
  'phone_screen',
  'hr',
  'technical',
  'take_home',
  'onsite',
  'final',
] as const;
export const interviewTypeSchema = z.enum(interviewTypeValues);
export type InterviewType = z.infer<typeof interviewTypeSchema>;

export const interviewOutcomeValues = ['pending', 'passed', 'failed', 'cancelled'] as const;
export const interviewOutcomeSchema = z.enum(interviewOutcomeValues);
export type InterviewOutcome = z.infer<typeof interviewOutcomeSchema>;

export const interviewerSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().max(120).optional(),
  email: z.string().email().optional(),
});

export const createInterviewSchema = z.object({
  round: z.coerce.number().int().min(1),
  type: interviewTypeSchema,
  scheduledAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  interviewers: z.array(interviewerSchema).max(20).optional().default([]),
  meetingUrl: z.string().url().optional(),
  location: z.string().max(200).optional(),
  prepNotes: z.string().max(5000).optional(),
});
export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

export const updateInterviewSchema = createInterviewSchema.partial().extend({
  outcome: interviewOutcomeSchema.optional(),
  feedbackNotes: z.string().max(5000).optional(),
});
export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>;
