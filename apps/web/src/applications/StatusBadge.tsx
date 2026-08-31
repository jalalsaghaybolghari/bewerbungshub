import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { ApplicationStatus } from '@bewerber/shared';

const COLORS: Record<ApplicationStatus, string> = {
  draft: 'bg-slate/15 text-slate',
  applied: 'bg-slate/15 text-slate',
  acknowledged: 'bg-accent/15 text-accent',
  screening: 'bg-accent/15 text-accent',
  interview: 'bg-accent/15 text-accent',
  offer: 'bg-success/15 text-success',
  accepted: 'bg-success/15 text-success',
  rejected: 'bg-danger/15 text-danger',
  withdrawn: 'bg-slate/15 text-slate',
  ghosted: 'bg-amber/15 text-amber',
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const { t } = useTranslation();
  return (
    <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', COLORS[status])}>
      {t(`applications.status.${status}`)}
    </span>
  );
}
