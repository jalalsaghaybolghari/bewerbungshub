import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
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
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which column a card renders in the instant it's dropped, independent of
  // exactly when the mutation's own query-cache update lands. That update
  // happens inside an async onMutate (it awaits cancelQueries first), which
  // breaks React's batching with the setActiveId(null) below — without this,
  // there's a render in between where the card is still shown back in its
  // old column, full opacity, before jumping to the new one a beat later.
  // This state update is plain and synchronous, so it always batches with
  // setActiveId(null) into one render. Cleared once the mutation settles,
  // since the cache is authoritative by then either way.
  const [overrides, setOverrides] = useState<Record<string, ApplicationStatus>>({});

  if (isLoading) return <p className="text-slate">{t('common.loading')}</p>;
  if (isError || !data) return <p className="text-danger">{t('common.error')}</p>;

  const byStatus = new Map<ApplicationStatus, Application[]>(
    applicationStatusValues.map((s) => [s, []]),
  );
  for (const app of data.items) byStatus.get(overrides[app._id] ?? app.status)?.push(app);
  const activeApp = activeId ? data.items.find((a) => a._id === activeId) : undefined;

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const targetStatus = over.id as ApplicationStatus;
    const app = data?.items.find((a) => a._id === active.id);
    if (!app || app.status === targetStatus) return;

    setOverrides((prev) => ({ ...prev, [app._id]: targetStatus }));
    moveStatus.mutate(
      { id: app._id, status: targetStatus },
      {
        onSettled: () => {
          setOverrides((prev) => {
            const { [app._id]: _moved, ...rest } = prev;
            return rest;
          });
        },
      },
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event: DragStartEvent) => setActiveId(event.active.id as string)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {applicationStatusValues.map((status) => (
          <KanbanColumn key={status} status={status} applications={byStatus.get(status) ?? []} />
        ))}
      </div>
      {/* Portals to document.body — the actual "lifted, following the
          pointer" card lives entirely outside any column's overflow-x-auto
          / padding layout, so nothing clips or reflows it mid-drag. The
          card in its column just fades out (see KanbanCard) instead of
          being transformed in place, which is what made dragging feel
          janky before. */}
      <DragOverlay>{activeApp && <KanbanCardContent application={activeApp} lifted />}</DragOverlay>
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
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: application._id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-opacity ${isDragging ? 'opacity-30' : ''}`}
      {...listeners}
      {...attributes}
    >
      <KanbanCardContent application={application} />
    </div>
  );
}

function KanbanCardContent({
  application,
  lifted,
}: {
  application: Application;
  lifted?: boolean;
}) {
  return (
    <div
      className={`cursor-grab rounded-xl border border-slate/15 bg-white p-3 shadow-sm active:cursor-grabbing ${
        lifted ? 'rotate-2 shadow-xl' : ''
      }`}
    >
      <Link
        to={`/applications/${application._id}`}
        className="text-sm font-semibold text-ink hover:text-teal"
      >
        {application.jobTitle}
      </Link>
      <div className="text-xs text-slate">{application.company.name}</div>
    </div>
  );
}
