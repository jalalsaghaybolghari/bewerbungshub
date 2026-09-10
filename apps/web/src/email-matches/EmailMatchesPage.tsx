import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ApplicationStatus, EmailMatch, UnmatchedEmailMatch } from '@bewerber/shared';
import { Button, Card, buttonClasses } from '../components/ui';
import { StatusBadge } from '../applications/StatusBadge';
import { ExternalLinkIcon } from '../components/icons';
import {
  usePendingEmailMatches,
  useApproveEmailMatch,
  useRejectEmailMatch,
  useRejectUnmatchedEmailMatch,
  useUnmatchedEmailMatches,
} from './api';
import { useSettings } from '../settings/api';

// #all/ (not #inbox/) so this still resolves once the thread has been
// archived or labeled, not just while it's sitting in the inbox.
function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

function EmailLink({ threadId }: { threadId: string | undefined }) {
  const { t } = useTranslation();
  if (!threadId) return null;
  return (
    <a
      href={gmailThreadUrl(threadId)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
    >
      <ExternalLinkIcon className="size-4" />
      {t('emailMatches.viewEmail')}
    </a>
  );
}

// Carries the email itself over to the new-application form as a
// prefilled related link (see ApplicationFormPage.tsx's linkLabel/linkUrl
// handling) — the whole reason "Add application" exists on an unmatched
// row is that this email is the evidence for an application that doesn't
// exist yet, so the link shouldn't have to be re-added by hand afterward.
function addApplicationUrl(match: UnmatchedEmailMatch): string {
  const params = new URLSearchParams({ company: match.companyGuess });
  if (match.gmailThreadId) {
    params.set('linkLabel', match.subject);
    params.set('linkUrl', gmailThreadUrl(match.gmailThreadId));
  }
  return `/applications/new?${params.toString()}`;
}

// UnmatchedEmailMatch.classification is never 'none' (the API already
// filters that out — see EmailMatchService.findUnmatched), so this only
// ever needs to cover the two real signals.
function classificationStatus(
  classification: UnmatchedEmailMatch['classification'],
): ApplicationStatus {
  return classification === 'rejection' ? 'rejected' : 'interview';
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
            className="min-w-0 truncate font-semibold text-ink hover:text-accent"
          >
            {match.applicationTitle}
          </Link>
          <span className="shrink-0 text-sm text-slate">· {match.applicationCompany}</span>
        </div>
        <div className="mb-2 flex items-center gap-2 text-xs text-slate">
          <span>{new Date(match.receivedAt).toLocaleDateString()}</span>
          <span>→</span>
          <StatusBadge status={match.proposedStatus} />
        </div>
        <EmailLink threadId={match.gmailThreadId} />
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

function UnmatchedRow({ match }: { match: UnmatchedEmailMatch }) {
  const { t } = useTranslation();
  const reject = useRejectUnmatchedEmailMatch();

  return (
    <Card className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="mb-1 truncate font-semibold text-ink">{match.companyGuess}</div>
        <div className="mb-2 flex items-center gap-2 text-xs text-slate">
          <span>{new Date(match.receivedAt).toLocaleDateString()}</span>
          <span>→</span>
          <StatusBadge status={classificationStatus(match.classification)} />
        </div>
        <EmailLink threadId={match.gmailThreadId} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link to={addApplicationUrl(match)} className={buttonClasses('secondary')}>
          {t('emailMatches.addApplication')}
        </Link>
        <Button
          type="button"
          variant="secondary"
          onClick={() => reject.mutate(match.id)}
          disabled={reject.isPending}
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
  const { data: settings } = useSettings();
  const isManualMode = settings?.gmailAutoApprove === false;
  const { data: unmatched } = useUnmatchedEmailMatches(isManualMode);

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

      {isManualMode && unmatched && unmatched.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-2 text-lg font-bold text-ink">{t('emailMatches.unmatchedTitle')}</h2>
          <p className="mb-4 text-sm text-slate">{t('emailMatches.unmatchedDescription')}</p>

          <div className="space-y-3">
            {unmatched.map((match) => (
              <UnmatchedRow key={match.id} match={match} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
