import type { gmail_v1 } from 'googleapis';

// Bounds how much cleaned body text classification/matching (and the
// stored EmailMatch.snippet) ever operate on — plenty to reach an outcome
// sentence anywhere near the top of a real email, without letting a
// pathological message (e.g. a huge quoted thread) balloon a stored doc.
const MAX_TEXT_LENGTH = 5000;

// Senders (LinkedIn's employer-relay emails, confirmed in production) pad
// the true preview with a long run of invisible characters right after the
// subject-echoing first line, specifically so Gmail's auto-generated
// `snippet` field — which stops at the first visible content — never
// reaches the real message (e.g. a rejection sentence further down).
// Stripped here so neither classification nor the stored display snippet
// carries hundreds of literal-but-invisible codepoints. Written as \u
// escapes rather than the literal characters so the source stays legible
// and diffable.
const INVISIBLE_CODEPOINTS = [
  0x00ad, // soft hyphen
  0x034f, // combining grapheme joiner
  0xfeff, // zero-width no-break space / BOM
];
const INVISIBLE_RANGES: Array<[number, number]> = [
  [0x200b, 0x200f], // zero-width space/non-joiner/joiner, LRM/RLM
  [0x202a, 0x202e], // directional embedding/override marks
  [0x2060, 0x2064], // word joiner, invisible operators
];
const INVISIBLE_CHARS_REGEX = new RegExp(
  `[${[
    ...INVISIBLE_CODEPOINTS.map((c) => `\\u${c.toString(16).padStart(4, '0')}`),
    ...INVISIBLE_RANGES.map(
      ([from, to]) =>
        `\\u${from.toString(16).padStart(4, '0')}-\\u${to.toString(16).padStart(4, '0')}`,
    ),
  ].join('')}]`,
  'g',
);

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function collectParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: { plain: string[]; html: string[] },
): void {
  if (!part) return;
  // A part with a filename is an attachment, not the message body, even
  // when its mimeType is text/plain (e.g. a .txt attachment).
  const data = !part.filename ? part.body?.data : undefined;
  if (data && part.mimeType === 'text/plain') {
    out.plain.push(decodeBase64Url(data));
  } else if (data && part.mimeType === 'text/html') {
    out.html.push(decodeBase64Url(data));
  }
  for (const child of part.parts ?? []) {
    collectParts(child, out);
  }
}

// Walks the real MIME body instead of relying on Gmail's own `snippet`
// field — see the comment on INVISIBLE_CHARS_REGEX for why the snippet
// alone isn't trustworthy. Concatenates text/plain and stripped text/html
// rather than preferring one — confirmed against a real production email
// (a LinkedIn rejection) that a multipart message's text/plain part can be
// nothing but footer/unsubscribe boilerplate while the actual message
// only exists in the text/html part, so preferring plain-when-present
// (the original approach here) silently dropped the real content.
// Redundant text between the two is harmless for keyword classification.
export function extractPlainText(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string {
  const collected = { plain: [] as string[], html: [] as string[] };
  collectParts(payload, collected);
  const pieces = [
    ...collected.plain,
    ...collected.html.map((html) => stripHtml(html)),
  ];
  return pieces.join('\n');
}

export function cleanEmailText(text: string): string {
  return text
    .replace(INVISIBLE_CHARS_REGEX, '')
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}
