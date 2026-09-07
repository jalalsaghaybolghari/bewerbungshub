import { terminalApplicationStatuses } from '@bewerber/shared';
import type {
  ApplicationStatus,
  EmailMatchClassification,
} from '@bewerber/shared';

// The non-terminal prefix of applicationStatusValues, in pipeline order —
// used only to compare *relative* position ("is this forward progress"),
// never to validate a status on its own.
const PIPELINE_ORDER: ApplicationStatus[] = [
  'draft',
  'applied',
  'acknowledged',
  'screening',
  'interview',
  'offer',
  'accepted',
];

export type SyncDecisionAction = 'auto' | 'manual' | 'no_action';

export interface SyncDecision {
  action: SyncDecisionAction;
  proposedStatus?: ApplicationStatus;
}

// PLAN.md's Phase 6 line says the system should "never auto-overwrite a
// status the user set manually" — reads like it should gate on
// Application.statusSetBy, but that field defaults to 'user' at the schema
// level and is never overridden by ApplicationsService.create(), so
// nearly every application already reads 'user' whether or not anyone
// touched its status. Gating on it would make auto-apply almost never
// fire. This is the real substitute: never auto-apply onto a terminal
// status (an end state nothing should silently override), and never
// auto-apply an 'interview' outcome that wouldn't be forward pipeline
// progress (don't auto-downgrade an 'offer' back to 'interview').
// Rejection is always a valid exit from any non-terminal state — it
// doesn't need the ordinal check.
export function decideOutcome(
  currentStatus: ApplicationStatus,
  classification: EmailMatchClassification,
  autoApproveEnabled: boolean,
): SyncDecision {
  if (classification === 'none') return { action: 'no_action' };

  const proposedStatus: ApplicationStatus =
    classification === 'rejection' ? 'rejected' : 'interview';

  if (
    terminalApplicationStatuses.includes(
      currentStatus as (typeof terminalApplicationStatuses)[number],
    )
  ) {
    return { action: 'manual', proposedStatus };
  }

  if (
    classification === 'interview' &&
    PIPELINE_ORDER.indexOf(currentStatus) >= PIPELINE_ORDER.indexOf('interview')
  ) {
    return { action: 'manual', proposedStatus };
  }

  return { action: autoApproveEnabled ? 'auto' : 'manual', proposedStatus };
}
