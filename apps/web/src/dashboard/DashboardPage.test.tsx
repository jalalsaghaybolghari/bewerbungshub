import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';
import type { ApplicationStats } from '../applications/types';

let statsData: ApplicationStats | undefined;
let isLoading = false;

vi.mock('../applications/api', () => ({
  useApplicationStats: () => ({ data: statsData, isLoading }),
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    statsData = undefined;
    isLoading = false;
  });

  it('shows a loading state while stats are being fetched (edge case)', () => {
    isLoading = true;
    renderDashboard();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows the no-data message when there are no applications yet (negative case)', () => {
    statsData = {
      total: 0,
      sentToday: 0,
      sentThisWeek: 0,
      responseRate: 0,
      avgDaysToFirstResponse: null,
      byStatus: {},
      byApplyType: {},
      overdueFollowUps: [],
    };
    renderDashboard();
    expect(screen.getByText(/add some applications first/i)).toBeInTheDocument();
  });

  it('renders stat cards and the overdue follow-ups list (happy path)', () => {
    statsData = {
      total: 12,
      sentToday: 2,
      sentThisWeek: 3,
      responseRate: 42,
      avgDaysToFirstResponse: 5,
      byStatus: { applied: 8, interview: 4 },
      byApplyType: { linkedin: 12 },
      overdueFollowUps: [
        {
          _id: 'app-1',
          jobTitle: 'Backend Engineer',
          company: { name: 'Acme' },
          nextFollowUpAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    };
    renderDashboard();

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/sent today/i)).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText(/backend engineer/i)).toBeInTheDocument();
  });
});
