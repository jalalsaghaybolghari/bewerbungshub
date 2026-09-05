import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ExternalLinkIcon, DocumentIcon } from '../components/icons';
import { CopyableUrlField } from '../components/CopyableUrlField';
import { RichTextContent } from '../components/RichTextContent';
import { isSafeHref } from '../lib/safe-url';
import { openCvFile, useCvs } from '../cvs/api';
import { StatusBadge } from './StatusBadge';
import type { Application } from './types';

function DateField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate">{label}</div>
      <div className="text-sm text-ink">{value ? new Date(value).toLocaleDateString() : '—'}</div>
    </div>
  );
}

export function ApplicationQuickViewModal({
  application,
  onClose,
}: {
  application: Application;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: cvs } = useCvs();
  const [cvError, setCvError] = useState<string | null>(null);
  const [openingCv, setOpeningCv] = useState(false);

  const cv = cvs?.find((c) => c._id === application.cvId);

  async function handleOpenCv() {
    if (!application.cvId) return;
    setCvError(null);
    setOpeningCv(true);
    try {
      await openCvFile(application.cvId);
    } catch {
      setCvError(t('applications.quickView.cvOpenError'));
    } finally {
      setOpeningCv(false);
    }
  }

  return (
    <Modal title={application.jobTitle} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={application.status} />
          <span className="text-sm text-slate">
            {application.company.name} · {application.location.raw}
          </span>
          <span className="rounded-full bg-slate/10 px-2 py-0.5 text-xs capitalize text-slate">
            {application.applyType}
          </span>
        </div>

        {isSafeHref(application.applyLink) ? (
          <a
            href={application.applyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <ExternalLinkIcon className="size-4" />
            {t('applications.quickView.applyLink')}
          </a>
        ) : (
          <p className="text-sm text-danger">{t('applications.quickView.unsafeLink')}</p>
        )}

        <div className="grid grid-cols-3 gap-4 rounded-lg bg-slate/5 p-3">
          <DateField label={t('applications.columns.posted')} value={application.postedAt} />
          <DateField label={t('applications.columns.sent')} value={application.sentAt} />
          <DateField label={t('applications.columns.created')} value={application.createdAt} />
        </div>

        {application.relatedLinks.length > 0 && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-slate">
              {t('applications.quickView.relatedLinks')}
            </div>
            <ul className="space-y-1">
              {application.relatedLinks.map((link, index) => (
                <li key={index}>
                  {isSafeHref(link.url) ? (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                    >
                      <ExternalLinkIcon className="size-4" />
                      {link.label}
                    </a>
                  ) : (
                    <span className="text-sm text-danger">
                      {link.label} ({t('applications.quickView.unsafeLink')})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-slate">
            {t('applications.quickView.cv')}
          </div>
          {application.cvId ? (
            <button
              type="button"
              onClick={() => void handleOpenCv()}
              disabled={openingCv}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline disabled:opacity-50"
            >
              <DocumentIcon className="size-4" />
              {cv?.label ?? t('applications.quickView.openCv')}
            </button>
          ) : (
            <p className="text-sm text-slate">{t('applications.quickView.noCv')}</p>
          )}
          {cvError && <p className="mt-1 text-xs text-danger">{cvError}</p>}
        </div>

        {application.tags.length > 0 && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-slate">
              {t('applications.quickView.tags')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {application.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {application.notes && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-slate">
              {t('applications.quickView.notes')}
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink">{application.notes}</p>
          </div>
        )}

        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-slate">
            {t('applications.form.jobDescription')}
          </div>
          <RichTextContent html={application.jobDescription} />
        </div>

        {/* Shown whenever present, even when it's identical to applyLink
            (true for every thin adapter — AMS/Xing/StepStone/Indeed never
            find a distinct off-site apply URL, so applyLink just falls
            back to the same captured page). Consistency beats deduping:
            "was this ever captured from the extension" should always have
            a predictable, visible answer. Copiable rather than just a
            link: this is the one field that should never be hand-edited,
            since it must stay exactly what was captured. Placed last —
            it's reference metadata, not something you'd act on first. */}
        {application.sourceUrl && (
          <CopyableUrlField
            label={t('applications.quickView.sourceUrl')}
            value={application.sourceUrl}
          />
        )}
      </div>
    </Modal>
  );
}
