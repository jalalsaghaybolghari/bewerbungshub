import { z } from 'zod';
import { applicationStatusSchema } from './applications';

// Presets only — a freeform "every N hours" field is easy to misconfigure
// (0, or an absurdly small value that hammers the Gmail API) and doesn't
// match how the setting is actually offered in the UI (a <select>).
export const gmailSyncIntervalMinutesValues = [15, 30, 60, 180, 360, 720] as const;
export type GmailSyncIntervalMinutes = (typeof gmailSyncIntervalMinutesValues)[number];
// z.coerce here (not left to the caller) since this always arrives as a
// <select>'s string value on the wire, same as the rest of this field's
// journey through react-hook-form.
export const gmailSyncIntervalMinutesSchema = z.coerce
  .number()
  .refine(
    (v): v is GmailSyncIntervalMinutes =>
      (gmailSyncIntervalMinutesValues as readonly number[]).includes(v),
    {
      message: 'Must be one of the supported sync intervals',
    },
  );

export const emailMatchClassificationValues = ['interview', 'rejection', 'none'] as const;
export const emailMatchClassificationSchema = z.enum(emailMatchClassificationValues);
export type EmailMatchClassification = z.infer<typeof emailMatchClassificationSchema>;

export const emailMatchDecisionValues = ['auto_applied', 'pending_approval', 'no_action'] as const;
export const emailMatchDecisionSchema = z.enum(emailMatchDecisionValues);
export type EmailMatchDecision = z.infer<typeof emailMatchDecisionSchema>;

export const gmailStatusSchema = z.object({
  connected: z.boolean(),
  connectedAt: z.coerce.date().optional(),
  lastSyncedAt: z.coerce.date().optional(),
  // Google's Testing-mode OAuth consent expires a refresh token after 7
  // days of inactivity — set once a sync hits invalid_grant, cleared on a
  // fresh connect. Drives the "reconnect" (not "connect") banner copy.
  needsReconnect: z.boolean(),
});
export type GmailStatus = z.infer<typeof gmailStatusSchema>;

// Only pending_approval matches are ever listed — auto_applied and
// no_action are audit/dedupe records, not something a user reviews.
export const emailMatchSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  applicationTitle: z.string(),
  applicationCompany: z.string(),
  subject: z.string(),
  snippet: z.string(),
  // Powers the "open in Gmail" link on the approval row — optional since
  // older records synced before this field was persisted may lack it.
  gmailThreadId: z.string().optional(),
  receivedAt: z.coerce.date(),
  classification: emailMatchClassificationSchema,
  proposedStatus: applicationStatusSchema,
});
export type EmailMatch = z.infer<typeof emailMatchSchema>;
