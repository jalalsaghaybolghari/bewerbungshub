import { guessCompanyFromSubject } from './company-guess';

describe('guessCompanyFromSubject', () => {
  it('extracts the company after "at" in a real LinkedIn subject (happy path)', () => {
    expect(
      guessCompanyFromSubject(
        'Your application to Software Developer/Software Entwickler (m/w/x) at philoro EDELMETALLE',
      ),
    ).toBe('philoro EDELMETALLE');
  });

  it('extracts the company after "Update from" (happy path)', () => {
    expect(guessCompanyFromSubject('Update from Acme')).toBe('Acme');
  });

  it('extracts the company after "Your update from" (happy path)', () => {
    expect(guessCompanyFromSubject('Your update from Acme')).toBe('Acme');
  });

  it('falls back to the full subject when no pattern matches (negative case)', () => {
    expect(guessCompanyFromSubject('Weekly job digest')).toBe(
      'Weekly job digest',
    );
  });
});
