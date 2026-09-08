// Deliberately an address allowlist by default, not a domain allowlist —
// a sender's domain alone isn't always a reliable "this email is about my
// application" signal. Verified against a real inbox:
// jobalerts-noreply@linkedin.com is saved-search job-alert digests only
// (never application status) and stays excluded. jobs-noreply@linkedin.com
// does send real application-status updates ("your application was sent
// to X", "was viewed by X") — but confirmed it *also* sends unrelated job
// recommendations ("X is hiring for a Y role", "Expand your search") from
// the same address, so this allowlist alone doesn't cleanly isolate
// status mail. That's fine in practice: classifyEmail only acts on a real
// interview/rejection keyword match, so the recommendation noise from
// this address just falls through to 'none'/no_action (logged for
// dedupe, never surfaced, never mutates an application) rather than
// causing a wrong match.
export const SENDER_ALLOWLIST = ['jobs-noreply@linkedin.com'];

// Whole (sub)domains belonging to dedicated recruiting/ATS platforms —
// unlike jobs-noreply@linkedin.com above, everything these domains send
// is application-related (no unrelated newsletter/suggestion traffic
// mixed in), and several of them vary their local-part per application
// (e.g. a per-candidate token), which an exact-address entry can't match
// at all. Each entry is the exact sending (sub)domain confirmed against a
// real inbox, not a suffix pattern to match against — e.g.
// message.digitalrecruiters.com does NOT also cover some other
// subdomain of digitalrecruiters.com that hasn't actually been seen.
export const SENDER_DOMAIN_ALLOWLIST = [
  'msg.join.com', // join.com — e.g. CYBERTEC PostgreSQL International GmbH
  'smartrecruiters.com', // SmartRecruiters — e.g. Thoesch GmbH
  'message.digitalrecruiters.com', // DigitalRecruiters — e.g. Segula Technologies
  'mail.onlyfy.jobs', // onlyfy/softgarden — e.g. NOVOMATIC AG
];

// Gmail's `From` header is typically `"Display Name" <address@example.com>`
// — extracts just the address for comparison against the allowlist.
export function extractSenderAddress(fromHeader: string): string {
  const match = /<([^>]+)>/.exec(fromHeader);
  return (match ? match[1] : fromHeader).trim().toLowerCase();
}

function extractSenderDomain(address: string): string {
  const at = address.lastIndexOf('@');
  return at === -1 ? '' : address.slice(at + 1);
}

// Several ATS platforms put the actual company name in the sender's
// display name rather than the address (e.g. `NOVOMATIC AG
// <reply@mail.onlyfy.jobs>`, where "NOVOMATIC" never otherwise appears in
// the subject or body) — used by matchApplication as a second trusted
// signal alongside the subject.
export function extractSenderDisplayName(fromHeader: string): string {
  const match = /^"?([^"<]*)"?\s*<[^>]+>$/.exec(fromHeader.trim());
  return match ? match[1].trim() : '';
}

export function isAllowlistedSender(fromHeader: string): boolean {
  const address = extractSenderAddress(fromHeader);
  if (SENDER_ALLOWLIST.includes(address)) return true;
  return SENDER_DOMAIN_ALLOWLIST.includes(extractSenderDomain(address));
}
