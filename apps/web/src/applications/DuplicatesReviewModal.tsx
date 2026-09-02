import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { Button } from '../components/ui';
import { useDeleteApplication, useDuplicatePairs, useMergeApplications } from './api';
import { StatusBadge } from './StatusBadge';
import type { Application, DuplicatePair } from './types';

export function DuplicatesReviewModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useDuplicatePairs();
  const mergeMutation = useMergeApplications();
  const deleteMutation = useDeleteApplication();
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  function handleKeep(pair: DuplicatePair, keepSide: 'a' | 'b') {
    const keep = keepSide === 'a' ? pair.a : pair.b;
    const drop = keepSide === 'a' ? pair.b : pair.a;
    mergeMutation.mutate(
      { keepId: keep._id, mergeId: drop._id },
      { onSuccess: () => setResolvedIds((prev) => new Set(prev).add(drop._id)) },
    );
  }

  function handleDelete(app: Application) {
    if (!confirm(t('applications.detail.confirmDelete'))) return;
    deleteMutation.mutate(app._id, {
      onSuccess: () => setResolvedIds((prev) => new Set(prev).add(app._id)),
    });
  }

  const pairs = (data?.pairs ?? []).filter(
    (pair) => !resolvedIds.has(pair.a._id) && !resolvedIds.has(pair.b._id),
  );

  return (
    <Modal title={t('applications.duplicates.title')} onClose={onClose}>
      {isLoading && <p className="text-slate">{t('common.loading')}</p>}
      {isError && <p className="text-danger">{t('common.error')}</p>}
      {!isLoading && !isError && pairs.length === 0 && (
        <p className="text-slate">{t('applications.duplicates.empty')}</p>
      )}

      {pairs.length > 0 && (
        <div className="space-y-4">
          {pairs.map((pair) => (
            <div
              key={`${pair.a._id}-${pair.b._id}`}
              className="rounded-lg border border-slate/15 p-3"
            >
              <div className="grid grid-cols-2 gap-3">
                {(['a', 'b'] as const).map((side) => {
                  const app = pair[side];
                  return (
                    <div key={app._id} className="space-y-1.5">
                      <div className="font-semibold text-ink">{app.jobTitle}</div>
                      <div className="text-sm text-slate">{app.company.name}</div>
                      <StatusBadge status={app.status} />
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => handleKeep(pair, side)}
                        >
                          {t('applications.duplicates.keepThis')}
                        </Button>
                        <Button type="button" variant="danger" onClick={() => handleDelete(app)}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate">
                {t('applications.duplicates.similarityNote', {
                  title: Math.round(pair.titleSimilarity * 100),
                  company: Math.round(pair.companySimilarity * 100),
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
