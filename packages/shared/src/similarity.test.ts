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
  it('scores an identical title+company as 1/1 (happy path)', () => {
    const score = scoreJobSimilarity(
      { jobTitle: 'Backend Engineer', companyName: 'Acme' },
      { jobTitle: 'Backend Engineer', companyName: 'Acme' },
    );
    expect(score).toEqual({ titleSimilarity: 1, companySimilarity: 1 });
  });

  it('treats a company legal-suffix difference as a full company match (edge case)', () => {
    const score = scoreJobSimilarity(
      { jobTitle: 'Backend Engineer', companyName: 'Acme GmbH' },
      { jobTitle: 'Backend Engineer', companyName: 'Acme' },
    );
    expect(score.companySimilarity).toBe(1);
  });

  it('scores unrelated jobs low on both axes (negative case)', () => {
    const score = scoreJobSimilarity(
      { jobTitle: 'Backend Engineer', companyName: 'Acme' },
      { jobTitle: 'Marketing Intern', companyName: 'Globex' },
    );
    expect(score.titleSimilarity).toBeLessThan(0.5);
    expect(score.companySimilarity).toBeLessThan(0.5);
  });
});

describe('isLikelyDuplicate', () => {
  it('is true above both thresholds (happy path)', () => {
    expect(isLikelyDuplicate({ titleSimilarity: 0.9, companySimilarity: 0.95 })).toBe(true);
  });

  it('is true exactly at both thresholds (edge case)', () => {
    expect(isLikelyDuplicate({ titleSimilarity: 0.6, companySimilarity: 0.82 })).toBe(true);
  });

  it('is false just below the title threshold (edge case)', () => {
    expect(isLikelyDuplicate({ titleSimilarity: 0.59, companySimilarity: 0.95 })).toBe(false);
  });

  it('is false just below the company threshold (edge case)', () => {
    expect(isLikelyDuplicate({ titleSimilarity: 0.9, companySimilarity: 0.81 })).toBe(false);
  });

  it('is false when both scores are low (negative case)', () => {
    expect(isLikelyDuplicate({ titleSimilarity: 0.1, companySimilarity: 0.1 })).toBe(false);
  });
});
