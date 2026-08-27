import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applicationStatusValues } from '@bewerber/shared';
import { useApplications } from './api';
import { Button, buttonClasses, Input, Select } from '../components/ui';
import { StatusBadge } from './StatusBadge';

const PAGE_SIZE = 20;

export function ApplicationsListPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useApplications({ q, status, page, pageSize: PAGE_SIZE });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">{t('applications.title')}</h1>
        <Link to="/applications/new" className={buttonClasses()}>
          {t('applications.new')}
        </Link>
      </div>

      <div className="mb-4 flex gap-3">
        <Input
          placeholder={t('applications.search')}
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          className="max-w-sm"
        />
        <Select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="max-w-[200px]"
        >
          <option value="">{t('applications.title')}</option>
          {applicationStatusValues.map((s) => (
            <option key={s} value={s}>
              {t(`applications.status.${s}`)}
            </option>
          ))}
        </Select>
      </div>

      {isLoading && <p className="text-slate">{t('common.loading')}</p>}
      {isError && <p className="text-danger">{t('common.error')}</p>}

      {data && data.items.length === 0 && <p className="text-slate">{t('applications.empty')}</p>}

      {data && data.items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate/15 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate/15 bg-slate/5 text-left text-xs uppercase tracking-wide text-slate">
                <th className="px-4 py-3">{t('applications.columns.position')}</th>
                <th className="px-4 py-3">{t('applications.columns.location')}</th>
                <th className="px-4 py-3">{t('applications.columns.channel')}</th>
                <th className="px-4 py-3">{t('applications.columns.sent')}</th>
                <th className="px-4 py-3">{t('applications.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((app) => (
                <tr key={app._id} className="border-b border-slate/10 last:border-0 hover:bg-slate/5">
                  <td className="px-4 py-3">
                    <Link to={`/applications/${app._id}`} className="font-semibold text-ink hover:text-teal">
                      {app.jobTitle}
                    </Link>
                    <div className="text-xs text-slate">{app.company.name}</div>
                  </td>
                  <td className="px-4 py-3 text-slate">{app.location.raw}</td>
                  <td className="px-4 py-3 text-slate capitalize">{app.applyType}</td>
                  <td className="px-4 py-3 text-slate">
                    {app.sentAt ? new Date(app.sentAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={app.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate">
          <span>
            {data.total} total · page {data.page}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ‹
            </Button>
            <Button
              variant="secondary"
              disabled={page * PAGE_SIZE >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
