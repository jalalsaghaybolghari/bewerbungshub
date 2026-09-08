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

  it('trusts the subject over a longer but unrelated company name mentioned in the body (regression guard — real "jobs recommended for you" false positive)', () => {
    // Confirmed against a real production email: LinkedIn's rejection
    // emails end with a "jobs recommended for you" section naming other
    // real companies, unrelated to the actual application. Once the body
    // (not just the short snippet) is searched, the longest-match rule
    // alone would pick one of those recommended companies over the real
    // one named in the subject, whenever its name happened to be longer.
    const result = matchApplication(
      [
        candidate({ id: 'app-1', companyName: 'philoro EDELMETALLE' }),
        candidate({
          id: 'app-2',
          companyName: 'Raiffeisen Bank International AG',
        }),
      ],
      'Your application to Software Developer at philoro EDELMETALLE',
      'Jobs recommended for you: Senior Frontend Developer at Raiffeisen Bank International AG.',
    );
    expect(result).toBe('app-1');
  });

  it('matches on the sender display name when the company appears nowhere in the subject or body (regression guard — real NOVOMATIC/onlyfy email)', () => {
    // Confirmed against a real production email: onlyfy/softgarden's
    // rejection subject is generic ("Your application – Software Tester
    // / Systems Integration (w/m/x)") and the body never names the
    // company either — only the sender's display name does
    // ("NOVOMATIC AG <reply@mail.onlyfy.jobs>").
    const result = matchApplication(
      [candidate({ id: 'app-1', companyName: 'NOVOMATIC AG' })],
      'Your application – Software Tester / Systems Integration (w/m/x)',
      'We have carefully evaluated your documents.',
      'NOVOMATIC AG',
    );
    expect(result).toBe('app-1');
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
