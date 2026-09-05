import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api-client';
import { LoginPage } from './LoginPage';

const loginMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
    register: vi.fn(),
    confirmEmail: vi.fn(),
    resendCode: vi.fn(),
    logout: vi.fn(),
    user: null,
    isLoading: false,
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not call login when submitted with an invalid email (negative case)', async () => {
    renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email');
    await userEvent.type(screen.getByLabelText(/password/i), 'whatever password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(loginMock).not.toHaveBeenCalled();
  });

  it('logs in and navigates to /applications on valid submit (happy path)', async () => {
    loginMock.mockResolvedValueOnce(undefined);
    renderLoginPage();

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a very strong password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(loginMock).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'a very strong password',
    });
    await vi.waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/applications'));
  });

  it('shows the server error and does not navigate when login rejects (edge case)', async () => {
    loginMock.mockRejectedValueOnce(new ApiError(401, 'Invalid email or password'));
    renderLoginPage();

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong password entirely');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('redirects to /verify-email with the email when login rejects as unverified (edge case)', async () => {
    loginMock.mockRejectedValueOnce(
      new ApiError(403, 'Please verify your email before logging in.', {
        code: 'EMAIL_NOT_VERIFIED',
        email: 'alice@example.com',
      }),
    );
    renderLoginPage();

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a very strong password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await vi.waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/verify-email', {
        state: { email: 'alice@example.com' },
      }),
    );
  });

  it('shows an inline error and does not navigate when the account is locked (edge case)', async () => {
    loginMock.mockRejectedValueOnce(
      new ApiError(403, 'This account has been locked. Contact support for help.', {
        code: 'ACCOUNT_LOCKED',
      }),
    );
    renderLoginPage();

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a very strong password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText(/locked/i)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
