import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Button, Card } from '../components/ui';
import { connectGmail, useDisconnectGmail, useGmailStatus } from './api';

// Mirrors CvsPage's GoogleDriveConnectionBanner exactly — captured once,
// on mount, via a lazy initializer so the banner stays visible for the
// user to read instead of disappearing the instant the effect below
// strips the params.
function GmailConnectionBanner() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status] = useState(() => ({
    connected: searchParams.get('gmailConnected'),
    error: searchParams.get('gmailError'),
  }));

  useEffect(() => {
    if (!status.connected && !status.error) return;
    const next = new URLSearchParams(searchParams);
    next.delete('gmailConnected');
    next.delete('gmailError');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status.connected) {
    return (
      <p className="mb-4 rounded-lg bg-success/15 px-3 py-2 text-sm text-success">
        {t('settings.gmail.connectedBanner')}
      </p>
    );
  }
  if (status.error) {
    return (
      <p className="mb-4 rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
        {t('settings.gmail.errorBanner')}
      </p>
    );
  }
  return null;
}

export function GmailSection() {
  const { t } = useTranslation();
  const { data: status, isLoading } = useGmailStatus();
  const disconnect = useDisconnectGmail();

  if (isLoading) return null;

  return (
    <Card className="mt-6">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t('settings.gmail.title')}</h2>
      <p className="mb-4 text-sm text-slate">{t('settings.gmail.description')}</p>

      <GmailConnectionBanner />

      {status?.needsReconnect && (
        <p className="mb-4 rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
          {t('settings.gmail.needsReconnect')}
        </p>
      )}

      {status?.connected ? (
        <div className="flex items-center justify-between rounded-lg border border-slate/15 bg-white px-4 py-3">
          <span className="text-sm text-ink">
            {status.lastSyncedAt
              ? t('settings.gmail.lastSynced', {
                  date: new Date(status.lastSyncedAt).toLocaleString(),
                })
              : t('settings.gmail.connected')}
          </span>
          <div className="flex items-center gap-2">
            {status.needsReconnect && (
              <Button type="button" onClick={() => void connectGmail()}>
                {t('settings.gmail.reconnect')}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {t('settings.gmail.disconnect')}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => void connectGmail()}>
          {t('settings.gmail.connect')}
        </Button>
      )}
    </Card>
  );
}
