import {
  normalizeForSimilarity,
  terminalApplicationStatuses,
} from '@bewerber/shared';
import type { ApplicationStatus } from '@bewerber/shared';

export interface MatchCandidate {
  id: string;
  companyName: string;
  status: ApplicationStatus;
}

// A company name that normalizes shorter than this is too generic to
// trust as a substring match (e.g. a two-letter abbreviation could appear
// in unrelated text by coincidence).
const MIN_COMPANY_NAME_LENGTH = 3;

function findLongestMatch(
  candidates: MatchCandidate[],
  text: string,
): string | null {
  const matches = candidates
    .filter(
      (c) =>
        !terminalApplicationStatuses.includes(
          c.status as (typeof terminalApplicationStatuses)[number],
        ),
    )
    .map((c) => ({
      id: c.id,
      name: normalizeForSimilarity(c.companyName, {
        stripCompanySuffixes: true,
      }),
    }))
    .filter(
      ({ name }) =>
        name.length >= MIN_COMPANY_NAME_LENGTH && text.includes(name),
    );

  if (matches.length === 0) return null;
  // Longest/most-specific company name wins when more than one matches
  // (e.g. "Acme" vs. "Acme Robotics" both appearing in the candidate set).
  matches.sort((a, b) => b.name.length - a.name.length);
  return matches[0].id;
}

// Deliberately simple — a plain substring check, not the bigram-Dice
// scoring `scoreJobSimilarity` uses for comparing two company names to
// each other. That function compares name-to-name; this compares a
// normalized company name against free text, which is a different
// problem substring matching solves well enough for this minimal first
// pass.
//
// Subject is tried alone first, and only falls back to the full
// subject+snippet text when the subject alone matches nothing. Confirmed
// against a real production email: once snippet became the extracted
// full body (see body-text.ts) rather than Gmail's short preview, an
// email whose body included a "jobs recommended for you" section (real
// company names, unrelated to the actual application) caused the
// longest-match rule above to pick one of those recommended companies
// over the real one named in the subject, whenever that name happened to
// be longer. LinkedIn's own application-status subjects always name the
// real company ("Your application to X at <Company>"), so trusting the
// subject first avoids that whole class of false positive.
export function matchApplication(
  candidates: MatchCandidate[],
  subject: string,
  snippet: string,
): string | null {
  const subjectOnly = normalizeForSimilarity(subject);
  const subjectMatch = findLongestMatch(candidates, subjectOnly);
  if (subjectMatch) return subjectMatch;

  const combined = normalizeForSimilarity(`${subject} ${snippet}`);
  return findLongestMatch(candidates, combined);
}
