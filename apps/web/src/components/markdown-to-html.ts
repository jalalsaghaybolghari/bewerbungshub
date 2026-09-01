// The reverse of packages/scrapers/src/html-to-markdown.ts's
// elementToMarkdown() — that converter is what produces the "##
// heading" / "**bold**" / "- item" text stored in jobDescription for
// every application captured by the extension (before the rich-text
// editor existed, or from a site adapter that still defers to it). This
// targets exactly that output shape, not general Markdown — same scoping
// choice the HTML→Markdown direction made.

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineToHtml(text: string): string {
  // Bold before italic — matching **x** first means the single `*`s
  // spent on bold don't get mistaken for italic delimiters afterward.
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

// True for anything containing what looks like a real HTML tag — used to
// decide whether a stored jobDescription needs this conversion at all
// (content saved through the rich-text editor is already HTML). Doesn't
// false-positive on stray `<`/`>` in plain text (e.g. "Salary < 50k"),
// since a bare `<` isn't immediately followed by a letter.
export function looksLikeHtml(text: string): boolean {
  return /<[a-z][^>]*>/i.test(text);
}

export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return '';

  return markdown
    .split(/\n\n+/)
    .map((block) => {
      const heading = block.match(/^(#{1,6})\s+([\s\S]*)$/);
      if (heading) {
        const level = heading[1].length;
        return `<h${level}>${inlineToHtml(heading[2])}</h${level}>`;
      }

      const lines = block.split('\n');
      if (lines.every((line) => /^-\s+/.test(line))) {
        const items = lines.map((line) => `<li>${inlineToHtml(line.replace(/^-\s+/, ''))}</li>`);
        return `<ul>${items.join('')}</ul>`;
      }
      if (lines.every((line) => /^\d+\.\s+/.test(line))) {
        const items = lines.map(
          (line) => `<li>${inlineToHtml(line.replace(/^\d+\.\s+/, ''))}</li>`,
        );
        return `<ol>${items.join('')}</ol>`;
      }

      // A plain paragraph — internal single newlines (from a converted
      // <br>, or just plain multi-line text typed before this editor
      // existed) become <br>, not separate paragraphs.
      return `<p>${lines.map(inlineToHtml).join('<br>')}</p>`;
    })
    .join('');
}

// What RichTextEditor/RichTextContent should actually render: pass real
// HTML through untouched, convert anything else.
export function toEditableHtml(value: string): string {
  return looksLikeHtml(value) ? value : markdownToHtml(value);
}
