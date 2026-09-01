import '@testing-library/jest-dom/vitest';
import '../i18n';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL's automatic afterEach-cleanup relies on detecting a global `afterEach`,
// which we don't have (vitest.config.ts keeps `globals: false` so test files
// import their own vitest APIs explicitly) — so it's registered explicitly here.
afterEach(cleanup);

// jsdom doesn't implement real layout, so ProseMirror's view code (used by
// RichTextEditor.tsx's Tiptap editor) throws the moment it tries to read a
// screen position for anything — even a plain `.focus()` call triggers a
// scroll-into-view that needs these. A well-known, standard gap when
// testing ProseMirror/Tiptap under jsdom; zeroed-out stand-ins are enough
// since no test here asserts on real pixel positions.
class FakeDOMRectList extends Array<DOMRect> implements DOMRectList {
  item(index: number) {
    return this[index] ?? null;
  }
}
Element.prototype.getClientRects = () => new FakeDOMRectList();
Range.prototype.getClientRects = () => new FakeDOMRectList();
Range.prototype.getBoundingClientRect = () =>
  ({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON() {},
  }) as DOMRect;
document.elementFromPoint = () => null;
