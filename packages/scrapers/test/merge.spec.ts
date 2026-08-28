import { describe, expect, it } from 'vitest';
import { mergeExtractions } from '../src/merge';
import type { ExtractedJobPosting } from '../src/types';

describe('mergeExtractions', () => {
  it('keeps the higher-confidence value per field regardless of order (happy path)', () => {
    const low: ExtractedJobPosting = {
      jobTitle: { value: 'guessed title', confidence: 0.2, source: 'heuristic' },
    };
    const high: ExtractedJobPosting = {
      jobTitle: { value: 'exact title', confidence: 0.9, source: 'json-ld' },
    };

    expect(mergeExtractions(low, high).jobTitle?.value).toBe('exact title');
    expect(mergeExtractions(high, low).jobTitle?.value).toBe('exact title');
  });

  it('fills in a field only present in one extraction (edge case)', () => {
    const a: ExtractedJobPosting = {
      jobTitle: { value: 'Engineer', confidence: 0.5, source: 'microdata' },
    };
    const b: ExtractedJobPosting = {
      companyName: { value: 'Acme', confidence: 0.5, source: 'microdata' },
    };

    const merged = mergeExtractions(a, b);

    expect(merged.jobTitle?.value).toBe('Engineer');
    expect(merged.companyName?.value).toBe('Acme');
  });

  it('returns an empty extraction when merging no results (negative case)', () => {
    expect(mergeExtractions()).toEqual({});
  });
});
