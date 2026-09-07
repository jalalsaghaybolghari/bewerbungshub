// Deliberately an address allowlist, not a domain allowlist — a sender's
// domain alone isn't a reliable "this email is about my application"
// signal. LinkedIn is the concrete example this was built for: it sends
// application-status updates (viewed/sent/Easy Apply confirmations) from
// jobs-noreply@linkedin.com, but job-suggestion digests and other
// marketing mail from other @linkedin.com addresses (e.g.
// jobalerts-noreply@linkedin.com) — matching the whole domain would pull
// in that noise too.
//
// NEEDS VERIFYING against a real inbox before relying on this in
// production — this address is LinkedIn's historically documented one for
// application-status mail, not confirmed against a live sample sent to a
// real connected account yet.
export const SENDER_ALLOWLIST = ['jobs-noreply@linkedin.com'];

// Gmail's `From` header is typically `"Display Name" <address@example.com>`
// — extracts just the address for comparison against the allowlist.
export function extractSenderAddress(fromHeader: string): string {
  const match = /<([^>]+)>/.exec(fromHeader);
  return (match ? match[1] : fromHeader).trim().toLowerCase();
}

export function isAllowlistedSender(fromHeader: string): boolean {
  return SENDER_ALLOWLIST.includes(extractSenderAddress(fromHeader));
}
