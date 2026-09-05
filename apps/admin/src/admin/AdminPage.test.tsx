import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminPage } from './AdminPage';
import type { AdminStats, AdminUsersListResponse } from '@bewerber/shared';

let statsData: AdminStats | undefined;
let statsLoading = false;
let usersData: AdminUsersListResponse | undefined;
let usersLoading = false;
const deleteMock = vi.fn();

vi.mock('./api', () => ({
  useAdminStats: () => ({ data: statsData, isLoading: statsLoading }),
  useAdminUsers: () => ({ data: usersData, isLoading: usersLoading }),
  useDeleteAdminUser: () => ({ mutate: deleteMock, isPending: false }),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', email: 'admin@example.com', isAdmin: true } }),
}));

const otherUser = {
  id: 'user-2',
  email: 'someone@example.com',
  displayName: 'Someone',
  locale: 'en' as const,
  emailVerified: true,
  isAdmin: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  applicationCount: 3,
  cvCount: 1,
};

const selfUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Admin',
  locale: 'en' as const,
  emailVerified: true,
  isAdmin: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  applicationCount: 0,
  cvCount: 0,
};

describe('AdminPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    statsData = undefined;
    statsLoading = false;
    usersData = undefined;
    usersLoading = false;
  });

  it('shows a loading state while stats are being fetched (edge case)', () => {
    statsLoading = true;
    render(<AdminPage />);
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('renders stat cards with the real values (happy path)', () => {
    statsData = {
      totalUsers: 5,
      verifiedUsers: 4,
      adminUsers: 1,
      totalApplications: 20,
      totalCvs: 6,
      newUsersLast7Days: 2,
    };
    render(<AdminPage />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('renders the user table with counts (happy path)', () => {
    usersData = { items: [otherUser], total: 1, page: 1, pageSize: 20 };
    render(<AdminPage />);

    expect(screen.getByText('someone@example.com')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows the empty state when there are no users (negative case)', () => {
    usersData = { items: [], total: 0, page: 1, pageSize: 20 };
    render(<AdminPage />);

    expect(screen.getByText(/no users yet/i)).toBeInTheDocument();
  });

  it('hides the delete button on the current admin’s own row (edge case)', () => {
    usersData = { items: [selfUser, otherUser], total: 2, page: 1, pageSize: 20 };
    render(<AdminPage />);

    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(1);
  });

  it('confirms and calls delete for another user (happy path)', async () => {
    usersData = { items: [otherUser], total: 1, page: 1, pageSize: 20 };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminPage />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(deleteMock).toHaveBeenCalledWith('user-2');
  });

  it('does not call delete when the confirmation is cancelled (negative case)', async () => {
    usersData = { items: [otherUser], total: 1, page: 1, pageSize: 20 };
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AdminPage />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(deleteMock).not.toHaveBeenCalled();
  });
});
