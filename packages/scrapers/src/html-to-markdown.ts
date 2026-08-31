const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'UL', 'OL']);
const HEADING_PATTERN = /^H[1-6]$/;

function inline(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\s+/g, ' ');
  }
  const el = node as Element;
  const inner = Array.from(el.childNodes).map(inline).join('');
  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      return inner.trim() ? `**${inner}**` : inner;
    case 'EM':
    case 'I':
      return inner.trim() ? `*${inner}*` : inner;
    case 'BR':
      return '\n';
    default:
      return inner;
  }
}

function walk(node: Node, blocks: string[]): void {
  if (node.nodeType === node.TEXT_NODE) {
    const text = (node.textContent ?? '').trim();
    if (text) blocks.push(text.replace(/\s+/g, ' '));
    return;
  }

  // Comment nodes (and anything else that isn't an element) have no
  // `.children` — Angular templates litter the real DOM with `<!---->`
  // placeholder comments between every conditionally-rendered element,
  // so this isn't a hypothetical: without this guard, `el.children`
  // below throws on the first one and the whole extraction is lost.
  if (node.nodeType !== node.ELEMENT_NODE) return;

  const el = node as Element;
  const tag = el.tagName;

  // UI chrome, never real content (e.g. AMS's detail page ends with a
  // "nach Oben" / "back to top" button inside the content area).
  if (tag === 'BUTTON') return;

  if (tag === 'UL' || tag === 'OL') {
    const items = Array.from(el.children)
      .filter((child) => child.tagName === 'LI')
      .map((li, i) => `${tag === 'OL' ? `${i + 1}.` : '-'} ${inline(li).trim()}`)
      .filter(Boolean);
    if (items.length) blocks.push(items.join('\n'));
    return;
  }

  if (HEADING_PATTERN.test(tag)) {
    const text = inline(el).trim();
    if (text) blocks.push(`${'#'.repeat(Number(tag[1]))} ${text}`);
    return;
  }

  const hasBlockChild = Array.from(el.children).some(
    (child) => BLOCK_TAGS.has(child.tagName) || HEADING_PATTERN.test(child.tagName),
  );
  if (hasBlockChild) {
    Array.from(el.childNodes).forEach((child) => walk(child, blocks));
    return;
  }

  const text = inline(el).trim();
  if (text) blocks.push(text);
}

// Converts an element's content to Markdown: paragraphs become blank-line
// separated blocks, <strong>/<b> and <em>/<i> become **bold**/*italic*, <ul>/
// <ol> become "- item"/"1. item" lists, <h1>-<h6> become "#" headings. Meant
// for job-posting-description-shaped HTML (a handful of paragraphs, maybe a
// requirements list) — not a general-purpose HTML-to-Markdown converter.
export function elementToMarkdown(root: Element): string {
  const blocks: string[] = [];
  walk(root, blocks);
  return blocks.join('\n\n').trim();
}
