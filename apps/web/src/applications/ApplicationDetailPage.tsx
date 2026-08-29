import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applicationStatusValues } from '@bewerber/shared';
import { useApplication, useChangeApplicationStatus, useDeleteApplication } from './api';
import { StatusBadge } from './StatusBadge';
import { Button, Card, Select } from '../components/ui';
import { InterviewsSection } from '../interviews/InterviewsSection';
import { FollowUpsSection } from '../follow-ups/FollowUpsSection';

export function ApplicationDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useApplication(id);
  const changeStatus = useChangeApplicationStatus(id ?? '');
  const deleteMutation = useDeleteApplication();

  if (isLoading) return <p className="text-slate">{t('common.loading')}</p>;
  if (isError || !data) return <p className="text-danger">{t('common.error')}</p>;

  const { application, events, interviews, followUps } = data;

  async function handleDelete() {
    if (!id) return;
    if (!confirm(t('applications.detail.confirmDelete'))) return;
    await deleteMutation.mutateAsync(id);
    navigate('/applications');
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{application.jobTitle}</h1>
          <p className="text-slate">
            {application.company.name} · {application.location.raw}
          </p>
          {application.postedAt && (
            <p className="text-xs text-slate">
              {t('applications.detail.postedAt', {
                date: new Date(application.postedAt).toLocaleDateString(),
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={application.status} />
          <Link
            to={`/applications/${application._id}/edit`}
            className="text-sm text-teal hover:underline"
          >
            {t('common.edit')}
          </Link>
        </div>
      </div>

      <Card className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink">{t('applications.detail.changeStatus')}</h2>
        </div>
        <Select
          value={application.status}
          onChange={(e) =>
            changeStatus.mutate({
              status: e.target.value as (typeof applicationStatusValues)[number],
            })
          }
          disabled={changeStatus.isPending}
        >
          {applicationStatusValues.map((s) => (
            <option key={s} value={s}>
              {t(`applications.status.${s}`)}
            </option>
          ))}
        </Select>
      </Card>

      <InterviewsSection applicationId={application._id} interviews={interviews} />
      <FollowUpsSection applicationId={application._id} followUps={followUps} />

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold text-ink">{t('applications.detail.timeline')}</h2>
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event._id} className="border-l-2 border-teal/40 pl-3 text-sm">
              <div className="font-medium text-ink">{event.type}</div>
              <div className="text-xs text-slate">
                {new Date(event.occurredAt).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mb-6 whitespace-pre-wrap text-sm text-ink">
        {application.jobDescription}
      </Card>

      <Button variant="danger" onClick={() => void handleDelete()}>
        {t('applications.detail.delete')}
      </Button>
    </div>
  );
}
