import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// 'verification_sent' is today's behavior (auto-approve on); 'pending_approval'
// means the account was created but no code was sent yet — an admin has to
// approve it first (see AuthService.approveAndSendCode).
export const registerResultSchema = z.object({
  email: z.string().email(),
  status: z.enum(['verification_sent', 'pending_approval']),
});
export type RegisterResult = z.infer<typeof registerResultSchema>;

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
