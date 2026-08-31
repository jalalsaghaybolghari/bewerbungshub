import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { applicationStatusValues } from '@bewerber/shared';
import { useApplicationStats } from '../applications/api';
import { Card } from '../components/ui';

export function DashboardPage() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useApplicationStats();

  if (isLoading) return <p className="text-slate">{t('common.loading')}</p>;
  if (!stats) return <p className="text-danger">{t('common.error')}</p>;

  if (stats.total === 0) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-2xl font-bold text-ink">{t('dashboard.title')}</h1>
        <p className="text-slate">{t('dashboard.noData')}</p>
      </div>
    );
  }

  const statusData = applicationStatusValues
    .map((status) => ({
      status,
      label: t(`applications.status.${status}`),
      count: stats.byStatus[status] ?? 0,
    }))
    .filter((row) => row.count > 0);

  const applyTypeData = Object.entries(stats.byApplyType).map(([type, count]) => ({ type, count }));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('dashboard.title')}</h1>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t('dashboard.totalTracked')} value={stats.total} />
        <StatCard label={t('dashboard.sentThisWeek')} value={stats.sentThisWeek} />
        <StatCard label={t('dashboard.responseRate')} value={`${stats.responseRate}%`} />
        <StatCard
          label={t('dashboard.avgDaysToReply')}
          value={stats.avgDaysToFirstResponse ?? '–'}
        />
      </div>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-ink">{t('dashboard.byStatus')}</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-ink">{t('dashboard.byApplyType')}</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={applyTypeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="type" tick={{ fontSize: 12 }} className="capitalize" />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-ink">{t('dashboard.overdueFollowUps')}</h2>
        {stats.overdueFollowUps.length === 0 ? (
          <p className="text-sm text-slate">{t('dashboard.noOverdue')}</p>
        ) : (
          <ul className="space-y-2">
            {stats.overdueFollowUps.map((app) => (
              <li key={app._id} className="flex items-center justify-between text-sm">
                <Link to={`/applications/${app._id}`} className="text-accent hover:underline">
                  {app.jobTitle} · {app.company.name}
                </Link>
                <span className="text-xs text-slate">
                  {new Date(app.nextFollowUpAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold text-ink">{value}</div>
      <div className="text-xs text-slate">{label}</div>
    </Card>
  );
}
