import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applicationStatusValues } from '@bewerber/shared';
import { useApplications, useDeleteApplication, useUpdateApplication } from './api';
import { Button, buttonClasses, Input, Select } from '../components/ui';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  ExternalLinkIcon,
  StarIcon,
  TrashIcon,
} from '../components/icons';
import { StatusBadge } from './StatusBadge';
import { KanbanBoard } from './KanbanBoard';
import { ApplicationQuickViewModal } from './ApplicationQuickViewModal';
import { DuplicatesReviewModal } from './DuplicatesReviewModal';
import type { Application } from './types';
import { isSafeHref } from '../lib/safe-url';

const PAGE_SIZE = 20;

// Only the columns the user asked to be able to sort by — Position/Sent/
// Status/Actions stay static headers.
type SortableColumn = 'location.raw' | 'applyType' | 'postedAt' | 'createdAt';

function SortableHeader({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortableColumn;
  sort: string;
  onSort: (column: SortableColumn) => void;
}) {
  const isDesc = sort === `-${column}`;
  const isActive = isDesc || sort === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 hover:text-ink ${isActive ? 'text-ink' : ''}`}
    >
      {label}
      {isActive &&
        (isDesc ? <ChevronDownIcon className="size-3" /> : <ChevronUpIcon className="size-3" />)}
    </button>
  );
}

export function ApplicationsListPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('draft');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [sort, setSort] = useState<string>('-createdAt');

  const { data, isLoading, isError } = useApplications({
    q,
    status,
    // Omitted entirely when off, not sent as `favorite=false` — the API
    // treats both the same, but this keeps the query string clean.
    favorite: favoritesOnly || undefined,
    page,
    pageSize: PAGE_SIZE,
    sort,
  });
  const deleteMutation = useDeleteApplication();
  const [quickViewApp, setQuickViewApp] = useState<Application | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);

  function handleDelete(id: string) {
    if (!confirm(t('applications.detail.confirmDelete'))) return;
    deleteMutation.mutate(id);
  }

  function handleSort(column: SortableColumn) {
    setPage(1);
    // Clicking the already-descending column flips to ascending; clicking
    // anything else (a new column, or the currently-ascending one) always
    // lands on descending first — that's the direction the user actually
    // asked for as the default action.
    setSort((current) => (current === `-${column}` ? column : `-${column}`));
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">{t('applications.title')}</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowDuplicates(true)}>
            {t('applications.duplicates.findSimilar')}
          </Button>
          <Link to="/applications/new" className={buttonClasses()}>
            {t('applications.new')}
          </Link>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-3">
          <Input
            placeholder={t('applications.search')}
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            className="max-w-sm"
          />
          {view === 'list' && (
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
          )}
          {view === 'list' && (
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setFavoritesOnly((v) => !v);
              }}
              aria-pressed={favoritesOnly}
              aria-label={t('applications.favoritesOnly')}
              className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                favoritesOnly
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-slate/30 bg-white text-slate hover:bg-slate/5'
              }`}
            >
              <StarIcon className="size-4" fill={favoritesOnly ? 'currentColor' : 'none'} />
              {t('applications.favoritesOnly')}
            </button>
          )}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-slate/30 text-sm">
          <button
            className={`px-3 py-1.5 ${view === 'list' ? 'bg-accent text-white' : 'bg-white text-ink hover:bg-slate/5'}`}
            onClick={() => setView('list')}
          >
            {t('applications.view.list')}
          </button>
          <button
            className={`px-3 py-1.5 ${view === 'kanban' ? 'bg-accent text-white' : 'bg-white text-ink hover:bg-slate/5'}`}
            onClick={() => setView('kanban')}
          >
            {t('applications.view.kanban')}
          </button>
        </div>
      </div>

      {view === 'kanban' && <KanbanBoard q={q} />}

      {view === 'list' && isLoading && <p className="text-slate">{t('common.loading')}</p>}
      {view === 'list' && isError && <p className="text-danger">{t('common.error')}</p>}

      {view === 'list' && data && data.items.length === 0 && (
        <p className="text-slate">{t('applications.empty')}</p>
      )}

      {view === 'list' && data && data.items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate/15 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate/15 bg-slate/5 text-left text-xs uppercase tracking-wide text-slate">
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3">{t('applications.columns.position')}</th>
                <th className="px-4 py-3">
                  <SortableHeader
                    label={t('applications.columns.location')}
                    column="location.raw"
                    sort={sort}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-4 py-3">
                  <SortableHeader
                    label={t('applications.columns.channel')}
                    column="applyType"
                    sort={sort}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-4 py-3">
                  <SortableHeader
                    label={t('applications.columns.posted')}
                    column="postedAt"
                    sort={sort}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-4 py-3">{t('applications.columns.sent')}</th>
                <th className="px-4 py-3">
                  <SortableHeader
                    label={t('applications.columns.created')}
                    column="createdAt"
                    sort={sort}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-4 py-3">{t('applications.columns.status')}</th>
                <th className="px-4 py-3">{t('applications.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((app) => (
                <ApplicationRow
                  key={app._id}
                  app={app}
                  onQuickView={() => setQuickViewApp(app)}
                  onDelete={() => handleDelete(app._id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'list' && data && data.total > PAGE_SIZE && (
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

      {quickViewApp && (
        <ApplicationQuickViewModal
          application={quickViewApp}
          onClose={() => setQuickViewApp(null)}
        />
      )}

      {showDuplicates && <DuplicatesReviewModal onClose={() => setShowDuplicates(false)} />}
    </div>
  );
}

function ApplicationRow({
  app,
  onQuickView,
  onDelete,
}: {
  app: Application;
  onQuickView: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const updateMutation = useUpdateApplication(app._id);

  return (
    <tr className="border-b border-slate/10 last:border-0 hover:bg-slate/5">
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => updateMutation.mutate({ favorite: !app.favorite })}
          disabled={updateMutation.isPending}
          aria-pressed={app.favorite}
          aria-label={app.favorite ? t('applications.unfavorite') : t('applications.favorite')}
          className={`hover:text-accent ${app.favorite ? 'text-accent' : 'text-slate/40'}`}
        >
          <StarIcon className="size-4" fill={app.favorite ? 'currentColor' : 'none'} />
        </button>
      </td>
      <td className="px-4 py-3">
        <Link to={`/applications/${app._id}`} className="font-semibold text-ink hover:text-accent">
          {app.jobTitle}
        </Link>
        <div className="text-xs text-slate">{app.company.name}</div>
      </td>
      <td className="px-4 py-3 text-slate">{app.location.raw}</td>
      <td className="px-4 py-3 text-slate capitalize">{app.applyType}</td>
      <td className="px-4 py-3 text-slate">
        {app.postedAt ? new Date(app.postedAt).toLocaleDateString() : '—'}
      </td>
      <td className="px-4 py-3 text-slate">
        {app.sentAt ? new Date(app.sentAt).toLocaleDateString() : '—'}
      </td>
      <td className="px-4 py-3 text-slate">{new Date(app.createdAt).toLocaleDateString()}</td>
      <td className="px-4 py-3">
        <StatusBadge status={app.status} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 text-slate">
          <button
            type="button"
            onClick={onQuickView}
            aria-label={t('applications.quickView.openDetails')}
            className="hover:text-accent"
          >
            <EyeIcon className="size-4" />
          </button>
          {isSafeHref(app.applyLink) && (
            <a
              href={app.applyLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('applications.columns.applyLink')}
              className="hover:text-accent"
            >
              <ExternalLinkIcon className="size-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label={t('common.delete')}
            className="hover:text-danger"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
