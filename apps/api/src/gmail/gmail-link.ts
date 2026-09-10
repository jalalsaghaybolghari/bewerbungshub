import type { EmailMatchClassification } from '@bewerber/shared';

// Same URL shape the web app already builds client-side for the "View
// email" link (apps/web/src/email-matches/EmailMatchesPage.tsx) —
// #all/ (not #inbox/) so it still resolves once the thread has been
// archived or labeled, not just while it's sitting in the inbox.
export function buildGmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

// Used as the related-link label for an email added via approve/auto-apply
// — 'none' is defensive only (both call sites are only ever reached once
// a real classification already gated the decision, so it's never
// actually 'none' in practice).
export function buildGmailRelatedLinkLabel(
  classification: EmailMatchClassification,
): string {
  if (classification === 'rejection') return 'Rejection Email';
  if (classification === 'interview') return 'Interview Email';
  return 'Email';
}
