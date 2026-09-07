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

// Deliberately simple — a plain substring check, not the bigram-Dice
// scoring `scoreJobSimilarity` uses for comparing two company names to
// each other. That function compares name-to-name; this compares a
// normalized company name against free text (subject+snippet), which is
// a different problem substring matching solves well enough for this
// minimal first pass.
export function matchApplication(
  candidates: MatchCandidate[],
  subject: string,
  snippet: string,
): string | null {
  const text = normalizeForSimilarity(`${subject} ${snippet}`);
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
