import { useEffect, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import clsx from 'clsx';
import { toEditableHtml } from './markdown-to-html';

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // Clicking a toolbar button would otherwise steal focus from the
      // editor before the command runs, collapsing the text selection
      // the command is supposed to act on.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        'rounded px-2 py-1 text-sm hover:bg-slate/10',
        active ? 'bg-accent/15 text-accent' : 'text-slate',
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap gap-0.5 rounded-t-lg border border-b-0 border-slate/30 bg-slate/5 p-1">
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Bold"
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Italic"
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        label="Underline"
      >
        <span className="underline">U</span>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Heading"
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        label="Subheading"
      >
        H3
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="Bullet list"
      >
        •
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="Numbered list"
      >
        1.
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        label="Quote"
      >
        ❝
      </ToolbarButton>
    </div>
  );
}

// Controlled like a normal form input (`value`/`onChange`), so it can drop
// straight into react-hook-form via `Controller` the same way `Textarea`
// slots into `register()`. `onChange` always emits HTML — Tiptap's own
// native format. `value` can be either that same HTML (once something's
// been saved through this editor) or the "## heading" / "**bold**"
// Markdown-ish text the extension's scrapers produce for everything
// captured before this existed — `toEditableHtml()` converts the latter
// on the way in, so old captures render with real formatting here too,
// not literal `**`/`#` syntax.
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: toEditableHtml(value),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          'rich-text min-h-40 rounded-b-lg border border-slate/30 px-3 py-2 focus:outline-none',
      },
    },
  });

  useEffect(() => {
    // Only resync when `value` (converted the same way the initial
    // content was) actually differs from what's currently rendered —
    // e.g. ApplicationFormPage's reset() populating the field after an
    // async load. Comparing the *converted* form, not raw `value`,
    // matters here: for legacy Markdown content, raw `value` never
    // equals `editor.getHTML()` (one's Markdown, the other's HTML) even
    // right after this exact content was just set, which would otherwise
    // re-run `setContent` on every render and reset the cursor while the
    // user is mid-edit. `useEditor` here always returns a live instance
    // (no `immediatelyRender: false`, no SSR in this SPA).
    const next = toEditableHtml(value);
    if (next !== editor.getHTML()) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
