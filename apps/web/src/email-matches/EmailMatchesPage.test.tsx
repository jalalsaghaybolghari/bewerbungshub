import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmailMatch } from '@bewerber/shared';
import { EmailMatchesPage } from './EmailMatchesPage';

let matchesData: EmailMatch[] | undefined;
let isLoading = false;
const approveMock = vi.fn();
const rejectMock = vi.fn();

vi.mock('./api', () => ({
  usePendingEmailMatches: () => ({ data: matchesData, isLoading }),
  useApproveEmailMatch: () => ({ mutate: approveMock, isPending: false }),
  useRejectEmailMatch: () => ({ mutate: rejectMock, isPending: false }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <EmailMatchesPage />
    </MemoryRouter>,
  );
}

function makeMatch(overrides: Partial<EmailMatch> = {}): EmailMatch {
  return {
    id: 'match-1',
    applicationId: 'app-1',
    applicationTitle: 'Backend Engineer',
    applicationCompany: 'Acme',
    subject: 'Update on your application',
    snippet: 'We would like to invite you to schedule a call.',
    gmailThreadId: 'thread-1',
    receivedAt: new Date('2026-01-01T00:00:00.000Z'),
    classification: 'interview',
    proposedStatus: 'interview',
    ...overrides,
  };
}

describe('EmailMatchesPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    matchesData = undefined;
    isLoading = false;
  });

  it('shows a loading state while pending matches are being fetched (edge case)', () => {
    isLoading = true;
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is nothing pending (negative case)', () => {
    matchesData = [];
    renderPage();
    expect(screen.getByText(/nothing waiting for review/i)).toBeInTheDocument();
  });

  it('renders a pending match with its application and proposed status (happy path)', () => {
    matchesData = [makeMatch()];
    renderPage();

    expect(screen.getByRole('link', { name: /backend engineer/i })).toHaveAttribute(
      'href',
      '/applications/app-1',
    );
    expect(screen.getByText(/acme/i)).toBeInTheDocument();
    expect(screen.getByText('Interview', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText(/schedule a call/i)).not.toBeInTheDocument();
  });

  it('links to the real email in Gmail via a "View email" link, opening in a new tab (happy path)', () => {
    matchesData = [makeMatch({ gmailThreadId: 'abc123' })];
    renderPage();

    const link = screen.getByRole('link', { name: /view email/i });
    expect(link).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#all/abc123');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText('Update on your application')).not.toBeInTheDocument();
  });

  it('shows no email link when a match has no gmailThreadId (edge case)', () => {
    matchesData = [makeMatch({ gmailThreadId: undefined })];
    renderPage();

    expect(screen.queryByRole('link', { name: /view email/i })).not.toBeInTheDocument();
  });

  it('calls approve with the match id when Approve is clicked (happy path)', async () => {
    matchesData = [makeMatch({ id: 'match-42' })];
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(approveMock).toHaveBeenCalledWith('match-42');
  });

  it('calls reject with the match id when Reject is clicked (happy path)', async () => {
    matchesData = [makeMatch({ id: 'match-42' })];
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /reject/i }));

    expect(rejectMock).toHaveBeenCalledWith('match-42');
  });
});
