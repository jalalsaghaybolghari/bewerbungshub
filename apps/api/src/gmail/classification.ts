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
];

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

// Subject + Gmail's own short `snippet` only — no MIME body parsing.
// Deliberately conservative: both-or-neither list matching returns 'none'
// rather than guessing, since an email matched by both a rejection and an
// interview phrase (e.g. quoting a prior thread) is genuinely ambiguous.
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
