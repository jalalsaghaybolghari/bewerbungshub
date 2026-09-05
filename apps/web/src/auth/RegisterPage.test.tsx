import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api-client';
import { RegisterPage } from './RegisterPage';

const registerMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    register: registerMock,
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

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
}

describe('RegisterPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers and navigates to /verify-email when auto-approve is on, not straight into the app (happy path)', async () => {
    registerMock.mockResolvedValueOnce({
      email: 'alice@example.com',
      status: 'verification_sent',
    });
    renderRegisterPage();

    await userEvent.type(screen.getByLabelText(/name/i), 'Alice');
    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a very strong password');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(registerMock).toHaveBeenCalledWith({
      displayName: 'Alice',
      email: 'alice@example.com',
      password: 'a very strong password',
    });
    await vi.waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/verify-email', {
        state: { email: 'alice@example.com' },
      }),
    );
  });

  it('navigates to /registration-pending when auto-approve is off (edge case)', async () => {
    registerMock.mockResolvedValueOnce({
      email: 'alice@example.com',
      status: 'pending_approval',
    });
    renderRegisterPage();

    await userEvent.type(screen.getByLabelText(/name/i), 'Alice');
    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a very strong password');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await vi.waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/registration-pending', {
        state: { email: 'alice@example.com' },
      }),
    );
  });

  it('shows the server error and does not navigate when registration rejects (negative case)', async () => {
    registerMock.mockRejectedValueOnce(
      new ApiError(409, 'An account with this email already exists'),
    );
    renderRegisterPage();

    await userEvent.type(screen.getByLabelText(/name/i), 'Alice');
    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a very strong password');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText('An account with this email already exists'),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
