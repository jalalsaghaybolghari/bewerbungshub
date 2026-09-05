import { describe, expect, it } from 'vitest';
import { createCvMetadataSchema } from './cvs';

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    label: 'Main resume',
    language: 'en',
    ...overrides,
  };
}

// Same latent bug class as applications.test.ts's query-string boolean
// coverage: isDefault/useGoogleDrive arrive as FormData string values,
// which z.coerce.boolean() would mis-read the same way it mis-reads a
// query param ("false" coerces to true via Boolean(...)). No current
// call site actually sends an explicit "false" for these two fields, but
// pin the correct behavior anyway so that stays true if one ever does.
describe('createCvMetadataSchema — FormData string booleans', () => {
  it('parses the literal string "false" as false for isDefault, not true (negative case)', () => {
    const result = createCvMetadataSchema.safeParse(baseInput({ isDefault: 'false' }));
    expect(result.success && result.data.isDefault).toBe(false);
  });

  it('parses the literal string "true" as true for isDefault (happy path)', () => {
    const result = createCvMetadataSchema.safeParse(baseInput({ isDefault: 'true' }));
    expect(result.success && result.data.isDefault).toBe(true);
  });

  it('parses the literal string "false" as false for useGoogleDrive, not true (negative case)', () => {
    const result = createCvMetadataSchema.safeParse(baseInput({ useGoogleDrive: 'false' }));
    expect(result.success && result.data.useGoogleDrive).toBe(false);
  });

  it('defaults both flags to false when omitted (edge case)', () => {
    const result = createCvMetadataSchema.safeParse(baseInput());
    expect(result.success && result.data.isDefault).toBe(false);
    expect(result.success && result.data.useGoogleDrive).toBe(false);
  });
});
