import { describe, expect, it } from 'vitest';
import { gmailSyncIntervalMinutesSchema, gmailStatusSchema, emailMatchSchema } from './gmail';

describe('gmailSyncIntervalMinutesSchema', () => {
  it('accepts every preset value (happy path)', () => {
    for (const minutes of [15, 30, 60, 180, 360, 720]) {
      expect(gmailSyncIntervalMinutesSchema.safeParse(minutes).success).toBe(true);
    }
  });

  it('coerces a string value from a <select> (happy path)', () => {
    const result = gmailSyncIntervalMinutesSchema.safeParse('180');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(180);
  });

  it('rejects a value outside the preset list (negative case)', () => {
    expect(gmailSyncIntervalMinutesSchema.safeParse(45).success).toBe(false);
    expect(gmailSyncIntervalMinutesSchema.safeParse(0).success).toBe(false);
  });
});

describe('gmailStatusSchema', () => {
  it('accepts a disconnected status with only the required fields (edge case)', () => {
    const result = gmailStatusSchema.safeParse({ connected: false, needsReconnect: false });
    expect(result.success).toBe(true);
  });

  it('coerces date strings for connectedAt/lastSyncedAt (happy path)', () => {
    const result = gmailStatusSchema.safeParse({
      connected: true,
      connectedAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: '2026-01-02T00:00:00.000Z',
      needsReconnect: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.connectedAt).toBeInstanceOf(Date);
      expect(result.data.lastSyncedAt).toBeInstanceOf(Date);
    }
  });
});

describe('emailMatchSchema', () => {
  it('rejects a classification outside the known enum (negative case)', () => {
    const result = emailMatchSchema.safeParse({
      id: 'match-1',
      applicationId: 'app-1',
      applicationTitle: 'Backend Engineer',
      applicationCompany: 'Acme',
      subject: 'Update on your application',
      snippet: 'We would like to invite you...',
      receivedAt: '2026-01-01T00:00:00.000Z',
      classification: 'maybe',
      proposedStatus: 'interview',
    });
    expect(result.success).toBe(false);
  });
});
