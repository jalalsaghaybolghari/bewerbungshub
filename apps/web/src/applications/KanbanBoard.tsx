import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applicationStatusValues, type ApplicationStatus } from '@bewerber/shared';
import { useApplications, useMoveApplicationStatus } from './api';
import type { Application } from './types';

export function KanbanBoard({ q }: { q: string }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useApplications({ q, page: 1, pageSize: 500 });
  const moveStatus = useMoveApplicationStatus();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (isLoading) return <p className="text-slate">{t('common.loading')}</p>;
  if (isError || !data) return <p className="text-danger">{t('common.error')}</p>;

  const byStatus = new Map<ApplicationStatus, Application[]>(
    applicationStatusValues.map((s) => [s, []]),
  );
  for (const app of data.items) byStatus.get(app.status)?.push(app);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const targetStatus = over.id as ApplicationStatus;
    const app = data?.items.find((a) => a._id === active.id);
    if (!app || app.status === targetStatus) return;
    moveStatus.mutate({ id: app._id, status: targetStatus });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {applicationStatusValues.map((status) => (
          <KanbanColumn key={status} status={status} applications={byStatus.get(status) ?? []} />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  applications,
}: {
  status: ApplicationStatus;
  applications: Application[];
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`w-64 flex-shrink-0 rounded-xl border p-3 ${
        isOver ? 'border-teal bg-teal/5' : 'border-slate/15 bg-slate/5'
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate">
        <span>{t(`applications.status.${status}`)}</span>
        <span className="rounded-full bg-slate/15 px-2 py-0.5 text-slate">
          {applications.length}
        </span>
      </div>
      <div className="space-y-2">
        {applications.map((app) => (
          <KanbanCard key={app._id} application={app} />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({ application }: { application: Application }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: application._id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`cursor-grab rounded-xl border border-slate/15 bg-white p-3 shadow-sm active:cursor-grabbing ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      }`}
      {...listeners}
      {...attributes}
    >
      <Link
        to={`/applications/${application._id}`}
        onClick={(e) => isDragging && e.preventDefault()}
        className="text-sm font-semibold text-ink hover:text-teal"
      >
        {application.jobTitle}
      </Link>
      <div className="text-xs text-slate">{application.company.name}</div>
    </div>
  );
}
