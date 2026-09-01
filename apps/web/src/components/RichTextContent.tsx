import DOMPurify from 'dompurify';
import { toEditableHtml } from './markdown-to-html';

// Read-only render of RichTextEditor's HTML output. `html` can be either
// real HTML (saved through the editor) or the "## heading"/"**bold**"
// Markdown-ish text the extension's scrapers produce for older captures
// — toEditableHtml() converts the latter so it renders with real
// formatting here too. Sanitized either way before insertion.
export function RichTextContent({ html }: { html: string }) {
  return (
    <div
      className="rich-text"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(toEditableHtml(html)) }}
    />
  );
}
