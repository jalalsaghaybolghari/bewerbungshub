import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api-client';
import { Button, Card } from '../components/ui';
import { CheckIcon, CopyIcon } from '../components/icons';
import { useApiKeyStatus, useGenerateApiKey, useRevokeApiKey } from './api';

export function ApiKeySection() {
  const { t } = useTranslation();
  const { data: status, isLoading } = useApiKeyStatus();
  const generate = useGenerateApiKey();
  const revoke = useRevokeApiKey();
  const [copied, setCopied] = useState(false);

  async function handleCopy(apiKey: string) {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the key
      // is still visible and selectable by hand, nothing else to do here.
    }
  }

  function handleGenerate() {
    setCopied(false);
    generate.mutate();
  }

  if (isLoading) return null;

  return (
    <Card className="mt-6">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t('settings.apiKey.title')}</h2>
      <p className="mb-4 text-sm text-slate">{t('settings.apiKey.description')}</p>

      {generate.data ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-accent">{t('settings.apiKey.generatedOnce')}</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={generate.data.apiKey}
              onFocus={(e) => e.target.select()}
              className="w-full flex-1 cursor-text rounded-lg border border-slate/30 bg-slate/5 px-3 py-2 font-mono text-sm text-ink"
            />
            <button
              type="button"
              onClick={() => void handleCopy(generate.data.apiKey)}
              aria-label={copied ? t('common.copied') : t('common.copy')}
              className="shrink-0 text-slate hover:text-accent"
            >
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            </button>
          </div>
        </div>
      ) : (
        <>
          {status?.hasKey ? (
            <p className="mb-4 text-sm text-ink">
              {t('settings.apiKey.createdAt', {
                date: status.createdAt ? new Date(status.createdAt).toLocaleDateString() : '',
              })}
            </p>
          ) : (
            <p className="mb-4 text-sm text-slate">{t('settings.apiKey.none')}</p>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleGenerate} disabled={generate.isPending}>
              {status?.hasKey ? t('settings.apiKey.regenerate') : t('settings.apiKey.generate')}
            </Button>
            {status?.hasKey && (
              <Button variant="danger" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
                {t('settings.apiKey.revoke')}
              </Button>
            )}
          </div>
        </>
      )}

      {generate.isError && (
        <p className="mt-3 text-sm text-danger">
          {generate.error instanceof ApiError ? generate.error.message : t('common.error')}
        </p>
      )}
    </Card>
  );
}
