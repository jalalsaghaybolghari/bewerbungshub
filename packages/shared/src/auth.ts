import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  locale: z.enum(['de', 'en']),
  isAdmin: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const confirmEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});
export type ConfirmEmailInput = z.infer<typeof confirmEmailSchema>;

export const resendCodeSchema = z.object({
  email: z.string().email(),
});
export type ResendCodeInput = z.infer<typeof resendCodeSchema>;
