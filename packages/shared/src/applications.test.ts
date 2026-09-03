import { describe, expect, it } from 'vitest';
import { createApplicationSchema, updateApplicationSchema } from './applications';

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    jobTitle: 'Backend Engineer',
    company: { name: 'Acme' },
    location: { raw: 'Vienna' },
    jobDescription: 'Build things.',
    applyLink: 'https://example.com/jobs/1',
    applyType: 'website',
    ...overrides,
  };
}

describe('createApplicationSchema — applyLink validation', () => {
  it('accepts a URL for a non-email applyType (happy path)', () => {
    const result = createApplicationSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
  });

  it('accepts an email address when applyType is email (happy path)', () => {
    const result = createApplicationSchema.safeParse(
      baseInput({ applyType: 'email', applyLink: 'jobs@company.com' }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an email address for a non-email applyType (negative case)', () => {
    const result = createApplicationSchema.safeParse(
      baseInput({ applyType: 'website', applyLink: 'jobs@company.com' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a non-email string when applyType is email (negative case)', () => {
    const result = createApplicationSchema.safeParse(
      baseInput({ applyType: 'email', applyLink: 'not-an-email' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a non-URL string for a non-email applyType (negative case)', () => {
    const result = createApplicationSchema.safeParse(
      baseInput({ applyType: 'linkedin', applyLink: 'not-a-url' }),
    );
    expect(result.success).toBe(false);
  });
});

describe('createApplicationSchema — cvId validation', () => {
  it('accepts a valid 24-char hex CV id (happy path)', () => {
    const result = createApplicationSchema.safeParse(
      baseInput({ cvId: '507f1f77bcf86cd799439011' }),
    );
    expect(result.success).toBe(true);
  });

  it('treats an empty string (the "—" no-CV option) as no CV selected, not an error (edge case)', () => {
    const result = createApplicationSchema.safeParse(baseInput({ cvId: '' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.cvId).toBeUndefined();
  });

  it('accepts a missing cvId (happy path)', () => {
    const result = createApplicationSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
  });

  it('rejects a malformed cvId instead of letting it reach the database layer (negative case)', () => {
    const result = createApplicationSchema.safeParse(baseInput({ cvId: 'not-an-id' }));
    expect(result.success).toBe(false);
  });
});

describe('updateApplicationSchema — applyLink validation', () => {
  it('accepts an email applyLink paired with applyType: email (happy path)', () => {
    const result = updateApplicationSchema.safeParse({
      applyType: 'email',
      applyLink: 'jobs@company.com',
    });
    expect(result.success).toBe(true);
  });

  it('skips validation when applyType is present but applyLink is absent (edge case)', () => {
    const result = updateApplicationSchema.safeParse({ applyType: 'email' });
    expect(result.success).toBe(true);
  });

  it('skips validation when applyLink is present but applyType is absent (edge case)', () => {
    const result = updateApplicationSchema.safeParse({ applyLink: 'jobs@company.com' });
    expect(result.success).toBe(true);
  });

  it('rejects a mismatched applyLink when both fields are present (negative case)', () => {
    const result = updateApplicationSchema.safeParse({
      applyType: 'email',
      applyLink: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});
