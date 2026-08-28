import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InterviewsSection } from './InterviewsSection';
import type { Interview } from './types';

const createMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();

vi.mock('./api', () => ({
  useCreateInterview: () => ({ mutateAsync: createMock }),
  useUpdateInterview: () => ({ mutate: updateMock }),
  useDeleteInterview: () => ({ mutate: removeMock }),
}));

const interview: Interview = {
  _id: 'int-1',
  applicationId: 'app-1',
  round: 1,
  type: 'phone_screen',
  scheduledAt: '2026-09-01T10:00:00.000Z',
  interviewers: [],
  outcome: 'pending',
};

describe('InterviewsSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state when there are no interviews (negative case)', () => {
    render(<InterviewsSection applicationId="app-1" interviews={[]} />);
    expect(screen.getByText(/no interviews scheduled yet/i)).toBeInTheDocument();
  });

  it('schedules a new interview with valid form data (happy path)', async () => {
    createMock.mockResolvedValueOnce(undefined);
    render(<InterviewsSection applicationId="app-1" interviews={[]} />);

    await userEvent.click(screen.getByRole('button', { name: /schedule interview/i }));
    await userEvent.type(screen.getByLabelText(/date & time/i), '2026-09-01T10:00');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await vi.waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ round: 1, type: 'phone_screen', scheduledAt: expect.anything() }),
    );
  });

  it('updates outcome and deletes an existing interview (edge case)', async () => {
    render(<InterviewsSection applicationId="app-1" interviews={[interview]} />);

    await userEvent.selectOptions(screen.getByDisplayValue(/pending/i), 'passed');
    expect(updateMock).toHaveBeenCalledWith({ id: 'int-1', input: { outcome: 'passed' } });

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(removeMock).toHaveBeenCalledWith('int-1');
  });
});
