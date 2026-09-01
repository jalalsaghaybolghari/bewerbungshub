import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ExternalLinkIcon, DocumentIcon } from '../components/icons';
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

        <a
          href={application.applyLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ExternalLinkIcon className="size-4" />
          {t('applications.quickView.applyLink')}
        </a>

        <div className="grid grid-cols-3 gap-4 rounded-lg bg-slate/5 p-3">
          <DateField label={t('applications.columns.posted')} value={application.postedAt} />
          <DateField label={t('applications.columns.sent')} value={application.sentAt} />
          <DateField label={t('applications.columns.created')} value={application.createdAt} />
        </div>

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
          <p className="whitespace-pre-wrap text-sm text-ink">{application.jobDescription}</p>
        </div>
      </div>
    </Modal>
  );
}
