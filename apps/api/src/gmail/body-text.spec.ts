import type { gmail_v1 } from 'googleapis';
import { cleanEmailText, extractPlainText } from './body-text';

function textPart(text: string): gmail_v1.Schema$MessagePart {
  return {
    mimeType: 'text/plain',
    body: { data: Buffer.from(text, 'utf-8').toString('base64url') },
  };
}

function htmlPart(html: string): gmail_v1.Schema$MessagePart {
  return {
    mimeType: 'text/html',
    body: { data: Buffer.from(html, 'utf-8').toString('base64url') },
  };
}

describe('extractPlainText', () => {
  it('decodes a single text/plain body part (happy path)', () => {
    expect(extractPlainText(textPart('Hello there.'))).toBe('Hello there.');
  });

  it('decodes a text/plain part nested inside multipart/alternative (happy path)', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/alternative',
      parts: [textPart('Plain version.'), htmlPart('<p>HTML version.</p>')],
    };
    expect(extractPlainText(payload)).toBe('Plain version.');
  });

  it('falls back to stripped HTML when no text/plain part exists (edge case)', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/alternative',
      parts: [htmlPart('<p>Only <b>HTML</b> here.</p>')],
    };
    expect(extractPlainText(payload)).toContain('Only');
    expect(extractPlainText(payload)).toContain('HTML');
    expect(extractPlainText(payload)).not.toContain('<');
  });

  it('skips a text/plain attachment part rather than treating it as the body (edge case)', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [
        { ...textPart('Real body.') },
        { ...textPart('attachment contents'), filename: 'notes.txt' },
      ],
    };
    expect(extractPlainText(payload)).toBe('Real body.');
  });

  it('returns an empty string for a payload with no usable text (negative case)', () => {
    expect(extractPlainText({ mimeType: 'multipart/mixed', parts: [] })).toBe(
      '',
    );
    expect(extractPlainText(undefined)).toBe('');
  });
});

describe('cleanEmailText', () => {
  it('strips invisible preheader-padding characters (regression guard — the philoro EDELMETALLE bug)', () => {
    // Mirrors the real production pattern found in a live LinkedIn
    // employer-relay rejection email: a subject-echoing first line, then a
    // long run of invisible characters (combining grapheme joiner, U+034F,
    // repeated), then the actual message — the exact shape that defeated
    // Gmail's own `snippet` field, which stops at the first visible
    // content and never reached the rejection sentence.
    const combiningGraphemeJoiner = String.fromCharCode(0x034f);
    const padding = combiningGraphemeJoiner.repeat(50);
    const raw = `Your application to Backend Engineer at Acme${padding}Unfortunately, we will not be moving forward with your application.`;
    const cleaned = cleanEmailText(raw);
    expect(cleaned).not.toContain(combiningGraphemeJoiner);
    expect(cleaned).toContain(
      'Unfortunately, we will not be moving forward with your application.',
    );
  });

  it('collapses runs of whitespace and trims (happy path)', () => {
    expect(cleanEmailText('  Hello    world  \n\n\n\nagain  ')).toBe(
      'Hello world \n\nagain',
    );
  });

  it('caps output length rather than growing unbounded (edge case)', () => {
    const huge = 'a'.repeat(10_000);
    expect(cleanEmailText(huge).length).toBe(5000);
  });
});
