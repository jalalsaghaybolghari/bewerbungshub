import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FollowUpsSection } from './FollowUpsSection';
import type { FollowUp } from './types';

const createMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();

vi.mock('./api', () => ({
  useCreateFollowUp: () => ({ mutateAsync: createMock }),
  useUpdateFollowUp: () => ({ mutate: updateMock }),
  useDeleteFollowUp: () => ({ mutate: removeMock }),
}));

const overdueFollowUp: FollowUp = {
  _id: 'fu-1',
  applicationId: 'app-1',
  dueAt: '2020-01-01T10:00:00.000Z',
  channel: 'email',
  status: 'scheduled',
};

describe('FollowUpsSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state when there are no follow-ups (negative case)', () => {
    render(<FollowUpsSection applicationId="app-1" followUps={[]} />);
    expect(screen.getByText(/no follow-ups scheduled yet/i)).toBeInTheDocument();
  });

  it('schedules a new follow-up with valid form data (happy path)', async () => {
    createMock.mockResolvedValueOnce(undefined);
    render(<FollowUpsSection applicationId="app-1" followUps={[]} />);

    await userEvent.click(screen.getByRole('button', { name: /schedule follow-up/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await vi.waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ channel: 'email' }));
  });

  it('flags an overdue follow-up and marks it sent (edge case)', async () => {
    render(<FollowUpsSection applicationId="app-1" followUps={[overdueFollowUp]} />);

    expect(screen.getByText(/overdue/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /mark sent/i }));
    expect(updateMock).toHaveBeenCalledWith({ id: 'fu-1', input: { status: 'sent' } });
  });
});
