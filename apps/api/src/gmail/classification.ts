import { normalizeForSimilarity } from '@bewerber/shared';
import type { EmailMatchClassification } from '@bewerber/shared';

// Kept short and high-precision on purpose — a false positive here writes
// a status change (or at least surfaces one for approval), so every phrase
// is one that's genuinely rare outside its own context. Never expanded
// with generic words ("no", "yes", "call") that would false-positive on
// unrelated mail.
const REJECTION_KEYWORDS = [
  // English
  'unfortunately',
  'decided to move forward with other candidates',
  'will not be moving forward',
  'other candidates',
  'not selected',
  // Both confirmed against real direct-company (non-LinkedIn) rejection
  // emails once those senders were added to SENDER_DOMAIN_ALLOWLIST —
  // "we are not able to move forward in the recruiting process with
  // you" (CYBERTEC PostgreSQL International GmbH) and "we were unable to
  // consider your application further for this position" (NOVOMATIC AG).
  'not able to move forward',
  'unable to consider your application',
  // Confirmed against a real Lever (ATS) rejection email (Blackshark.ai):
  // "we regret to inform you that we have chosen not to move forward at
  // this time."
  'chosen not to move forward',
  // German — normalizeForSimilarity only lowercases/strips punctuation, it
  // doesn't fold umlauts, so these must be written with them (ü/ä/ö) to
  // ever actually match.
  'leider',
  'andere bewerber',
  'absage',
  'nicht berücksichtigen',
];

const INTERVIEW_KEYWORDS = [
  // English
  'schedule a call',
  'schedule an interview',
  'would like to invite you',
  'next steps',
  'speak with you',
  // German
  'gespräch',
  'interviewtermin',
  'vorstellungsgespräch',
  'kennenlernen',
  // Confirmed against a real direct-company interview invite (Segula
  // Technologies, via DigitalRecruiters): "...würden Sie gerne zu einem
  // Google Meet Interview einladen." Deliberately not the bare word
  // "interview" alone — that would also match plenty of real rejection
  // emails that mention interview only to say the candidate won't reach
  // one, and both-lists-match already falls back to 'none' on ambiguity.
  'interview einladen',
];

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

// Subject + the caller-supplied body text (GmailSyncService passes the
// cleaned MIME body extracted in body-text.ts, not Gmail's short auto
// `snippet` — that field was found to truncate before reaching the actual
// outcome sentence on real production emails). Deliberately conservative:
// both-or-neither list matching returns 'none' rather than guessing, since
// an email matched by both a rejection and an interview phrase (e.g.
// quoting a prior thread) is genuinely ambiguous.
export function classifyEmail(
  subject: string,
  snippet: string,
): EmailMatchClassification {
  const text = normalizeForSimilarity(`${subject} ${snippet}`);
  const rejected = containsAny(text, REJECTION_KEYWORDS);
  const interview = containsAny(text, INTERVIEW_KEYWORDS);
  if (rejected && !interview) return 'rejection';
  if (interview && !rejected) return 'interview';
  return 'none';
}
