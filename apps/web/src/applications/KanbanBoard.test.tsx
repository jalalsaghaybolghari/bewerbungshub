import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from './KanbanBoard';
import type { Application, ApplicationsListResponse } from './types';

let listData: ApplicationsListResponse | undefined;
let isLoading = false;
let isError = false;
const moveMock = vi.fn();

vi.mock('./api', () => ({
  useApplications: () => ({ data: listData, isLoading, isError }),
  useMoveApplicationStatus: () => ({ mutate: moveMock }),
}));

function makeApplication(overrides: Partial<Application>): Application {
  return {
    _id: 'app-1',
    jobTitle: 'Backend Engineer',
    company: { name: 'Acme' },
    location: { raw: 'Berlin' },
    jobDescription: '',
    applyLink: 'https://example.com/job',
    applyType: 'linkedin',
    status: 'applied',
    statusChangedAt: '2026-01-01T00:00:00.000Z',
    statusSetBy: 'user',
    followUpCount: 0,
    tags: [],
    relatedLinks: [],
    favorite: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderKanban() {
  return render(
    <MemoryRouter>
      <KanbanBoard q="" />
    </MemoryRouter>,
  );
}

describe('KanbanBoard', () => {
  afterEach(() => {
    vi.clearAllMocks();
    listData = undefined;
    isLoading = false;
    isError = false;
  });

  it('shows an error message when applications fail to load (negative case)', () => {
    isError = true;
    renderKanban();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('renders every status column even when there are no applications (edge case)', () => {
    listData = { items: [], total: 0, page: 1, pageSize: 500 };
    renderKanban();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Ghosted')).toBeInTheDocument();
  });

  it('groups applications into their matching status column (happy path)', () => {
    listData = {
      items: [
        makeApplication({ _id: 'app-1', jobTitle: 'Backend Engineer', status: 'applied' }),
        makeApplication({ _id: 'app-2', jobTitle: 'Frontend Engineer', status: 'interview' }),
      ],
      total: 2,
      page: 1,
      pageSize: 500,
    };
    renderKanban();

    const appliedColumn = screen.getByText('Applied').closest('div')?.parentElement as HTMLElement;
    expect(within(appliedColumn).getByText(/backend engineer/i)).toBeInTheDocument();

    const interviewColumn = screen.getByText('Interview').closest('div')
      ?.parentElement as HTMLElement;
    expect(within(interviewColumn).getByText(/frontend engineer/i)).toBeInTheDocument();
  });
});
