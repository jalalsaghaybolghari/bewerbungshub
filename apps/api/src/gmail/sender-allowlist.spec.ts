import {
  extractSenderAddress,
  extractSenderDisplayName,
  isAllowlistedSender,
} from './sender-allowlist';

describe('extractSenderAddress', () => {
  it('extracts the address from a display-name header (happy path)', () => {
    expect(
      extractSenderAddress('"NOVOMATIC AG" <reply@mail.onlyfy.jobs>'),
    ).toBe('reply@mail.onlyfy.jobs');
  });

  it('returns the header as-is when there is no display name (edge case)', () => {
    expect(extractSenderAddress('reply@mail.onlyfy.jobs')).toBe(
      'reply@mail.onlyfy.jobs',
    );
  });
});

describe('extractSenderDisplayName', () => {
  it('extracts a quoted display name (happy path)', () => {
    expect(
      extractSenderDisplayName(
        '"CYBERTEC PostgreSQL International GmbH Recruiting Team" <no-reply@msg.join.com>',
      ),
    ).toBe('CYBERTEC PostgreSQL International GmbH Recruiting Team');
  });

  it('extracts an unquoted display name (edge case — real production header shape)', () => {
    expect(
      extractSenderDisplayName('NOVOMATIC AG <reply@mail.onlyfy.jobs>'),
    ).toBe('NOVOMATIC AG');
  });

  it('returns an empty string when there is no display name at all (negative case)', () => {
    expect(extractSenderDisplayName('reply@mail.onlyfy.jobs')).toBe('');
  });
});

describe('isAllowlistedSender', () => {
  it('matches the exact LinkedIn address (happy path)', () => {
    expect(isAllowlistedSender('"LinkedIn" <jobs-noreply@linkedin.com>')).toBe(
      true,
    );
  });

  it('matches a sender at an allowlisted ATS domain regardless of local-part (happy path — real DigitalRecruiters shape)', () => {
    expect(
      isAllowlistedSender(
        'Niimat Semmar <candidature.brg9n7yg75mbnj6@message.digitalrecruiters.com>',
      ),
    ).toBe(true);
  });

  it('matches a sender at Lever (happy path — real Blackshark.ai shape)', () => {
    expect(isAllowlistedSender('Blackshark.ai <mail@hire.eu.lever.co>')).toBe(
      true,
    );
  });

  it('rejects a sender that is neither the exact address nor an allowlisted domain (negative case)', () => {
    expect(isAllowlistedSender('"Newsletter" <hello@random-company.com>')).toBe(
      false,
    );
  });

  it('rejects a different LinkedIn address not in the allowlist (edge case)', () => {
    expect(
      isAllowlistedSender('"LinkedIn" <jobalerts-noreply@linkedin.com>'),
    ).toBe(false);
  });
});
