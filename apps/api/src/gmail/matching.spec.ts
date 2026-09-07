import { matchApplication, type MatchCandidate } from './matching';

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return { id: 'app-1', companyName: 'Acme', status: 'applied', ...overrides };
}

describe('matchApplication', () => {
  it('matches on the normalized company name appearing in the subject (happy path)', () => {
    const result = matchApplication(
      [candidate({ id: 'app-1', companyName: 'Acme GmbH' })],
      'Update on your application to Acme',
      '',
    );
    expect(result).toBe('app-1');
  });

  it('matches on the normalized company name appearing in the snippet (happy path)', () => {
    const result = matchApplication(
      [candidate({ id: 'app-1', companyName: 'Acme Robotics' })],
      'Application update',
      'Thank you for applying to Acme Robotics.',
    );
    expect(result).toBe('app-1');
  });

  it('excludes applications already in a terminal status (negative case)', () => {
    const result = matchApplication(
      [candidate({ id: 'app-1', companyName: 'Acme', status: 'rejected' })],
      'Update from Acme',
      '',
    );
    expect(result).toBeNull();
  });

  it('returns null when no candidate company name appears in the text (negative case)', () => {
    const result = matchApplication(
      [candidate({ id: 'app-1', companyName: 'Acme' })],
      'Update from Globex',
      'We received your application.',
    );
    expect(result).toBeNull();
  });

  it('skips company names too short to trust as a substring match (edge case)', () => {
    const result = matchApplication(
      [candidate({ id: 'app-1', companyName: 'Ab' })],
      'Update on your application',
      'This mentions ab in passing.',
    );
    expect(result).toBeNull();
  });

  it('prefers the longest/most-specific matching company name (edge case)', () => {
    const result = matchApplication(
      [
        candidate({ id: 'app-1', companyName: 'Acme' }),
        candidate({ id: 'app-2', companyName: 'Acme Robotics' }),
      ],
      'Update from Acme Robotics',
      '',
    );
    expect(result).toBe('app-2');
  });

  it('strips company suffixes before matching (edge case)', () => {
    const result = matchApplication(
      [candidate({ id: 'app-1', companyName: 'Beispiel GmbH' })],
      'Ihre Bewerbung bei Beispiel',
      '',
    );
    expect(result).toBe('app-1');
  });
});
