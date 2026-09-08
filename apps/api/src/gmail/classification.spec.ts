import { classifyEmail } from './classification';

describe('classifyEmail', () => {
  it.each([
    [
      'Update on your application',
      'Unfortunately, we have decided to move forward with other candidates.',
    ],
    [
      'Bewerbung Backend Engineer',
      'Leider können wir Ihre Bewerbung nicht berücksichtigen.',
    ],
    [
      'Your application status',
      'We regret to inform you that you were not selected for this role.',
    ],
    [
      'Your application at CYBERTEC PostgreSQL International GmbH',
      // Real production text (CYBERTEC PostgreSQL International GmbH, via join.com)
      'Based on your profile and the number of other qualified applications, for the moment, we are not able to move forward in the recruiting process with you.',
    ],
    [
      'Your application – Software Tester / Systems Integration (w/m/x)',
      // Real production text (NOVOMATIC AG, via onlyfy/softgarden)
      'We have carefully evaluated your documents and tried to match it to our internal requirements. We regret to inform you that we were unable to consider your application further for this position.',
    ],
    [
      'Thanks for your interest in Blackshark.ai, Jalal',
      // Real production text (Blackshark.ai, via Lever)
      'After careful consideration of your application and resume, we regret to inform you that we have chosen not to move forward at this time.',
    ],
  ])('classifies a rejection email (happy path): %s', (subject, snippet) => {
    expect(classifyEmail(subject, snippet)).toBe('rejection');
  });

  it.each([
    [
      'Next steps for your application',
      'We would like to invite you to schedule a call with our team.',
    ],
    [
      'Bewerbung Backend Engineer',
      'Wir möchten Sie gerne zu einem Vorstellungsgespräch einladen.',
    ],
    [
      'Interview request',
      'We would like to speak with you next week, are you available?',
    ],
    [
      'AT – Einladung zum Google Meet Interview',
      // Real production text (Segula Technologies, via DigitalRecruiters)
      'wir bedanken uns für Ihre Bewerbung und würden Sie gerne zu einem Google Meet Interview einladen.',
    ],
  ])('classifies an interview invite (happy path): %s', (subject, snippet) => {
    expect(classifyEmail(subject, snippet)).toBe('interview');
  });

  it('returns none for an email with no classification signal (negative case)', () => {
    expect(
      classifyEmail(
        'Your weekly job digest',
        'Here are 5 new jobs matching your search.',
      ),
    ).toBe('none');
  });

  it('returns none rather than guessing when both signals are present (edge case)', () => {
    expect(
      classifyEmail(
        'Re: Your application',
        'Unfortunately the interview process has been paused, but we would like to speak with you again in future.',
      ),
    ).toBe('none');
  });

  it('is case-insensitive (edge case)', () => {
    expect(classifyEmail('UNFORTUNATELY', 'we picked OTHER CANDIDATES')).toBe(
      'rejection',
    );
  });
});
