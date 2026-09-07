import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GmailStatus } from '@bewerber/shared';
import { Layout } from './Layout';

let gmailStatusData: GmailStatus | undefined;

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'user@example.com' }, logout: vi.fn() }),
}));

vi.mock('../settings/api', () => ({
  useGmailStatus: () => ({ data: gmailStatusData }),
}));

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  afterEach(() => {
    gmailStatusData = undefined;
  });

  it('hides the Email Tracking nav link when Gmail is not connected (happy path)', () => {
    gmailStatusData = { connected: false, needsReconnect: false };
    renderLayout();

    expect(screen.queryByRole('link', { name: /email tracking/i })).not.toBeInTheDocument();
  });

  it('hides the Email Tracking nav link while Gmail status is still loading (edge case)', () => {
    gmailStatusData = undefined;
    renderLayout();

    expect(screen.queryByRole('link', { name: /email tracking/i })).not.toBeInTheDocument();
  });

  it('shows the Email Tracking nav link once Gmail is connected (happy path)', () => {
    gmailStatusData = { connected: true, needsReconnect: false };
    renderLayout();

    expect(screen.getByRole('link', { name: /email tracking/i })).toHaveAttribute(
      'href',
      '/email-matches',
    );
  });

  it('always shows the other nav links regardless of Gmail status (edge case)', () => {
    gmailStatusData = { connected: false, needsReconnect: false };
    renderLayout();

    expect(screen.getByRole('link', { name: /applications/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^cvs$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });
});
