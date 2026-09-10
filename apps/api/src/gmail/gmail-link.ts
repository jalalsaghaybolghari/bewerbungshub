// Same URL shape the web app already builds client-side for the "View
// email" link (apps/web/src/email-matches/EmailMatchesPage.tsx) —
// #all/ (not #inbox/) so it still resolves once the thread has been
// archived or labeled, not just while it's sitting in the inbox.
export function buildGmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}
