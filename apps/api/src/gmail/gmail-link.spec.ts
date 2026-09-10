import { buildGmailRelatedLinkLabel, buildGmailThreadUrl } from './gmail-link';

describe('buildGmailThreadUrl', () => {
  it('builds a #all/ Gmail URL for the given thread id (happy path)', () => {
    expect(buildGmailThreadUrl('thread-123')).toBe(
      'https://mail.google.com/mail/u/0/#all/thread-123',
    );
  });
});

describe('buildGmailRelatedLinkLabel', () => {
  it('labels a rejection (happy path)', () => {
    expect(buildGmailRelatedLinkLabel('rejection')).toBe('Rejection Email');
  });

  it('labels an interview (happy path)', () => {
    expect(buildGmailRelatedLinkLabel('interview')).toBe('Interview Email');
  });

  it('falls back to a generic label for none (edge case — defensive only, never actually reached in practice)', () => {
    expect(buildGmailRelatedLinkLabel('none')).toBe('Email');
  });
});
