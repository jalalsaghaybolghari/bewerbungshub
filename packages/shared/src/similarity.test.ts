import { describe, expect, it } from 'vitest';
import {
  bigramDiceCoefficient,
  isLikelyDuplicate,
  normalizeForSimilarity,
  scoreJobSimilarity,
} from './similarity';

describe('normalizeForSimilarity', () => {
  it('lowercases, strips punctuation, and collapses whitespace (happy path)', () => {
    expect(normalizeForSimilarity('  Senior   Backend-Engineer!! ')).toBe(
      'senior backend engineer',
    );
  });

  it('strips a trailing company legal suffix when asked (happy path)', () => {
    expect(normalizeForSimilarity('Acme GmbH', { stripCompanySuffixes: true })).toBe('acme');
  });

  it('strips the longest matching suffix first (edge case)', () => {
    expect(normalizeForSimilarity('Acme GmbH & Co KG', { stripCompanySuffixes: true })).toBe(
      'acme',
    );
  });

  it('does not strip a suffix when not asked to (negative case)', () => {
    expect(normalizeForSimilarity('Acme GmbH')).toBe('acme gmbh');
  });

  it('leaves a name with no matching suffix untouched (negative case)', () => {
    expect(normalizeForSimilarity('Acme', { stripCompanySuffixes: true })).toBe('acme');
  });
});

describe('bigramDiceCoefficient', () => {
  it('scores identical strings as 1 (happy path)', () => {
    expect(bigramDiceCoefficient('acme', 'acme')).toBe(1);
  });

  it('scores completely different strings low (negative case)', () => {
    expect(bigramDiceCoefficient('acme', 'zephyr')).toBeLessThan(0.2);
  });

  it('scores near-identical strings high (happy path)', () => {
    expect(
      bigramDiceCoefficient('senior software engineer', 'senior software enginee'),
    ).toBeGreaterThan(0.9);
  });

  it('falls back to exact equality for strings shorter than 2 characters (edge case)', () => {
    expect(bigramDiceCoefficient('a', 'a')).toBe(1);
    expect(bigramDiceCoefficient('a', 'b')).toBe(0);
    expect(bigramDiceCoefficient('', '')).toBe(1);
  });
});

describe('scoreJobSimilarity', () => {
  it('scores an identical title+company+location as 1/1/1 (happy path)', () => {
    const score = scoreJobSimilarity(
      { jobTitle: 'Backend Engineer', companyName: 'Acme', locationRaw: 'Vienna' },
      { jobTitle: 'Backend Engineer', companyName: 'Acme', locationRaw: 'Vienna' },
    );
    expect(score).toEqual({ titleSimilarity: 1, companySimilarity: 1, locationSimilarity: 1 });
  });

  it('treats a company legal-suffix difference as a full company match (edge case)', () => {
    const score = scoreJobSimilarity(
      { jobTitle: 'Backend Engineer', companyName: 'Acme GmbH', locationRaw: 'Vienna' },
      { jobTitle: 'Backend Engineer', companyName: 'Acme', locationRaw: 'Vienna' },
    );
    expect(score.companySimilarity).toBe(1);
  });

  it('treats one location containing the other as a full match (edge case)', () => {
    // Plain Dice coefficient scores this pair only ~0.56 (length-imbalance
    // penalty) despite being the same place — "one adds detail the other
    // doesn't" is common enough for locations specifically to need its own
    // substring-containment rule, not just the shared exact-match fast path.
    const score = scoreJobSimilarity(
      { jobTitle: 'Backend Engineer', companyName: 'Acme', locationRaw: 'Vienna' },
      { jobTitle: 'Backend Engineer', companyName: 'Acme', locationRaw: 'Vienna, Austria' },
    );
    expect(score.locationSimilarity).toBe(1);
  });

  it('falls back to the Dice score for two locations with no containment relationship (negative case)', () => {
    // Confirms the containment fast path isn't silently swallowing every
    // pair of similar-looking city names — these two share no substring
    // relationship, so the raw bigram score still applies and lands well
    // under a full match.
    const score = scoreJobSimilarity(
      { jobTitle: 'Backend Engineer', companyName: 'Acme', locationRaw: 'Berlin' },
      { jobTitle: 'Backend Engineer', companyName: 'Acme', locationRaw: 'Bern' },
    );
    expect(score.locationSimilarity).toBeLessThan(1);
    expect(score.locationSimilarity).toBeGreaterThan(0);
  });

  it('scores unrelated jobs low on every axis (negative case)', () => {
    const score = scoreJobSimilarity(
      { jobTitle: 'Backend Engineer', companyName: 'Acme', locationRaw: 'Vienna' },
      { jobTitle: 'Marketing Intern', companyName: 'Globex', locationRaw: 'Berlin' },
    );
    expect(score.titleSimilarity).toBeLessThan(0.5);
    expect(score.companySimilarity).toBeLessThan(0.5);
    expect(score.locationSimilarity).toBeLessThan(0.5);
  });
});

describe('isLikelyDuplicate', () => {
  it('is true above every threshold (happy path)', () => {
    expect(
      isLikelyDuplicate({ titleSimilarity: 0.9, companySimilarity: 0.95, locationSimilarity: 0.9 }),
    ).toBe(true);
  });

  it('is true exactly at every threshold (edge case)', () => {
    expect(
      isLikelyDuplicate({ titleSimilarity: 0.6, companySimilarity: 0.82, locationSimilarity: 0.6 }),
    ).toBe(true);
  });

  it('is false just below the title threshold (edge case)', () => {
    expect(
      isLikelyDuplicate({
        titleSimilarity: 0.59,
        companySimilarity: 0.95,
        locationSimilarity: 0.9,
      }),
    ).toBe(false);
  });

  it('is false just below the company threshold (edge case)', () => {
    expect(
      isLikelyDuplicate({ titleSimilarity: 0.9, companySimilarity: 0.81, locationSimilarity: 0.9 }),
    ).toBe(false);
  });

  it('is false just below the location threshold, even with a matching title and company (edge case)', () => {
    expect(
      isLikelyDuplicate({
        titleSimilarity: 0.9,
        companySimilarity: 0.95,
        locationSimilarity: 0.59,
      }),
    ).toBe(false);
  });

  it('is false when every score is low (negative case)', () => {
    expect(
      isLikelyDuplicate({ titleSimilarity: 0.1, companySimilarity: 0.1, locationSimilarity: 0.1 }),
    ).toBe(false);
  });
});
