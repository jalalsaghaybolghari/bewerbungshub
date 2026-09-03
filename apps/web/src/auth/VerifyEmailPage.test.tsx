import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api-client';
import { VerifyEmailPage } from './VerifyEmailPage';

const confirmEmailMock = vi.fn();
const resendCodeMock = vi.fn();
const navigateMock = vi.fn();
let locationState: { email?: string } | null = { email: 'alice@example.com' };

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    register: vi.fn(),
    confirmEmail: confirmEmailMock,
    resendCode: resendCodeMock,
    logout: vi.fn(),
    user: null,
    isLoading: false,
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: locationState }),
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <VerifyEmailPage />
    </MemoryRouter>,
  );
}

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    locationState = { email: 'alice@example.com' };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('pre-fills the email from navigation state (happy path)', () => {
    renderPage();

    expect(screen.getByLabelText(/email/i)).toHaveValue('alice@example.com');
  });

  it('leaves the email blank when navigation state is missing (edge case)', () => {
    locationState = null;
    renderPage();

    expect(screen.getByLabelText(/email/i)).toHaveValue('');
  });

  it('confirms the code and navigates to /applications (happy path)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    confirmEmailMock.mockResolvedValueOnce(undefined);
    renderPage();

    await user.type(screen.getByLabelText(/verification code/i), '123456');
    await user.click(screen.getByRole('button', { name: /^verify$/i }));

    expect(confirmEmailMock).toHaveBeenCalledWith({
      email: 'alice@example.com',
      code: '123456',
    });
    await vi.waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/applications'));
  });

  it('shows the server error and does not navigate on a wrong code (negative case)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    confirmEmailMock.mockRejectedValueOnce(new ApiError(400, 'Incorrect code'));
    renderPage();

    await user.type(screen.getByLabelText(/verification code/i), '000000');
    await user.click(screen.getByRole('button', { name: /^verify$/i }));

    expect(await screen.findByText('Incorrect code')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('disables resend during the initial cooldown, then allows it once expired (edge case)', async () => {
    renderPage();

    expect(screen.queryByRole('button', { name: /resend code/i })).not.toBeInTheDocument();
    expect(screen.getByText(/resend code in 60s/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByRole('button', { name: /resend code/i })).toBeInTheDocument();
  });

  it('calls resendCode and restarts the cooldown when the resend button is clicked (happy path)', async () => {
    resendCodeMock.mockResolvedValueOnce(undefined);
    renderPage();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /resend code/i }));

    expect(resendCodeMock).toHaveBeenCalledWith({ email: 'alice@example.com' });
    expect(await screen.findByText(/a new code has been sent/i)).toBeInTheDocument();
    expect(screen.getByText(/resend code in 60s/i)).toBeInTheDocument();
  });
});
