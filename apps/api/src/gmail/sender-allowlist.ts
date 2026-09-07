// Deliberately an address allowlist, not a domain allowlist — a sender's
// domain alone isn't a reliable "this email is about my application"
// signal. Verified against a real inbox: jobalerts-noreply@linkedin.com
// is saved-search job-alert digests only (never application status) and
// stays excluded. jobs-noreply@linkedin.com does send real
// application-status updates ("your application was sent to X", "was
// viewed by X") — but confirmed it *also* sends unrelated job
// recommendations ("X is hiring for a Y role", "Expand your search")
// from the same address, so this allowlist alone doesn't cleanly isolate
// status mail. That's fine in practice: classifyEmail only acts on a real
// interview/rejection keyword match, so the recommendation noise from
// this address just falls through to 'none'/no_action (logged for
// dedupe, never surfaced, never mutates an application) rather than
// causing a wrong match.
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
