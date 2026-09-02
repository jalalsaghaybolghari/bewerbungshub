// Fuzzy job-title/company-name matching, used by the applications module to
// flag likely-duplicate applications (same role, captured twice) without
// requiring an exact string match. Deliberately dependency-free — bigram
// Dice coefficient is order-insensitive at the substring level (handles
// "Senior Backend Engineer" vs "Backend Engineer, Senior"), has no tunable
// edit-cost parameters unlike Jaro-Winkler, and is simple to hand-verify.

// Longest match first, so "gmbh co kg" strips before "gmbh" alone would.
// Written already punctuation-free — normalizeForSimilarity strips
// punctuation (including "&") before suffix-matching runs, so a suffix
// containing punctuation would never match.
const COMPANY_SUFFIXES = [
  'gmbh co kg',
  'gmbh',
  'ag',
  'inc',
  'llc',
  'ltd',
  'corp',
  'co',
  'e.u.',
  'eu',
  'kg',
  'se',
  'plc',
  'bv',
  'sa',
  'oy',
] as const;

export function normalizeForSimilarity(
  raw: string,
  opts?: { stripCompanySuffixes?: boolean },
): string {
  let normalized = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (opts?.stripCompanySuffixes) {
    for (const suffix of COMPANY_SUFFIXES) {
      const withSpace = ` ${suffix}`;
      if (normalized.endsWith(withSpace)) {
        normalized = normalized.slice(0, -withSpace.length).trim();
        break;
      }
    }
  }

  return normalized;
}

function bigrams(s: string): string[] {
  if (s.length < 2) return [s];
  const result: string[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    result.push(s.slice(i, i + 2));
  }
  return result;
}

// Bigram sets are degenerate below 2 characters — fall back to exact
// equality rather than let a near-empty bigram set produce a meaningless
// score.
export function bigramDiceCoefficient(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);

  const countsB = new Map<string, number>();
  for (const bg of bigramsB) countsB.set(bg, (countsB.get(bg) ?? 0) + 1);

  let matches = 0;
  for (const bg of bigramsA) {
    const remaining = countsB.get(bg) ?? 0;
    if (remaining > 0) {
      matches++;
      countsB.set(bg, remaining - 1);
    }
  }

  return (2 * matches) / (bigramsA.length + bigramsB.length);
}

export interface SimilarityScore {
  titleSimilarity: number;
  companySimilarity: number;
}

export function scoreJobSimilarity(
  a: { jobTitle: string; companyName: string },
  b: { jobTitle: string; companyName: string },
): SimilarityScore {
  const titleA = normalizeForSimilarity(a.jobTitle);
  const titleB = normalizeForSimilarity(b.jobTitle);
  const companyA = normalizeForSimilarity(a.companyName, { stripCompanySuffixes: true });
  const companyB = normalizeForSimilarity(b.companyName, { stripCompanySuffixes: true });

  return {
    titleSimilarity: titleA === titleB ? 1 : bigramDiceCoefficient(titleA, titleB),
    companySimilarity: companyA === companyB ? 1 : bigramDiceCoefficient(companyA, companyB),
  };
}

// Company names must match tightly (typo/suffix variance only); titles are
// allowed to match more loosely since the same role often gets phrased
// differently across sites/postings.
export const SIMILARITY_THRESHOLDS = {
  company: 0.82,
  title: 0.6,
} as const;

export function isLikelyDuplicate(score: SimilarityScore): boolean {
  return (
    score.companySimilarity >= SIMILARITY_THRESHOLDS.company &&
    score.titleSimilarity >= SIMILARITY_THRESHOLDS.title
  );
}
