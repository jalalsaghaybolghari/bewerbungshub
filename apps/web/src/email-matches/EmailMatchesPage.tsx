import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { EmailMatch } from '@bewerber/shared';
import { Button, Card } from '../components/ui';
import { StatusBadge } from '../applications/StatusBadge';
import { usePendingEmailMatches, useApproveEmailMatch, useRejectEmailMatch } from './api';

// #all/ (not #inbox/) so this still resolves once the thread has been
// archived or labeled, not just while it's sitting in the inbox.
function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

function EmailMatchRow({ match }: { match: EmailMatch }) {
  const { t } = useTranslation();
  const approve = useApproveEmailMatch();
  const reject = useRejectEmailMatch();
  const isPending = approve.isPending || reject.isPending;

  return (
    <Card className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <Link
            to={`/applications/${match.applicationId}`}
            className="font-semibold text-ink hover:text-accent"
          >
            {match.applicationTitle}
          </Link>
          <span className="text-sm text-slate">· {match.applicationCompany}</span>
        </div>
        <div className="mb-2 flex items-center gap-2 text-xs text-slate">
          <span>{new Date(match.receivedAt).toLocaleDateString()}</span>
          <span>→</span>
          <StatusBadge status={match.proposedStatus} />
        </div>
        {match.gmailThreadId ? (
          <a
            href={gmailThreadUrl(match.gmailThreadId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-ink underline decoration-slate/40 hover:text-accent"
          >
            {match.subject}
          </a>
        ) : (
          <p className="text-sm font-medium text-ink">{match.subject}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" onClick={() => approve.mutate(match.id)} disabled={isPending}>
          {t('emailMatches.approve')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => reject.mutate(match.id)}
          disabled={isPending}
        >
          {t('emailMatches.reject')}
        </Button>
      </div>
    </Card>
  );
}

export function EmailMatchesPage() {
  const { t } = useTranslation();
  const { data: matches, isLoading } = usePendingEmailMatches();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold text-ink">{t('emailMatches.title')}</h1>
      <p className="mb-6 text-sm text-slate">{t('emailMatches.description')}</p>

      {isLoading && <p className="text-slate">{t('common.loading')}</p>}
      {matches && matches.length === 0 && <p className="text-slate">{t('emailMatches.empty')}</p>}

      <div className="space-y-3">
        {matches?.map((match) => (
          <EmailMatchRow key={match.id} match={match} />
        ))}
      </div>
    </div>
  );
}
