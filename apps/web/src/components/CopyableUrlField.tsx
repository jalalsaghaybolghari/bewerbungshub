import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from './ui';
import { CheckIcon, CopyIcon, ExternalLinkIcon } from './icons';

// A URL the user should be able to copy or open, but never edit — e.g.
// the extension-captured source URL, which must stay exactly what was
// actually captured. `readOnly`, not `disabled`: a disabled input can't
// be focused or selected in most browsers, which would make it look
// copiable without actually being copiable by hand.
export function CopyableUrlField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the field
      // is still selectable and copiable by hand, nothing else to do here.
    }
  }

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          className="w-full flex-1 cursor-text rounded-lg border border-slate/30 bg-slate/5 px-3 py-2 text-sm text-slate"
        />
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? t('common.copied') : t('common.copy')}
          className="shrink-0 text-slate hover:text-accent"
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        </button>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="shrink-0 text-slate hover:text-accent"
        >
          <ExternalLinkIcon className="size-4" />
        </a>
      </div>
    </div>
  );
}
