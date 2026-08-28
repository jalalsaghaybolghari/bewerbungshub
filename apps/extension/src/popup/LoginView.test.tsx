import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginView } from './LoginView';
import { ApiError } from '../lib/api-client';

const loginMock = vi.fn();

vi.mock('../lib/auth', () => ({
  login: (...args: unknown[]) => loginMock(...args),
}));

describe('LoginView', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not call login when submitted with an invalid email (negative case)', async () => {
    const onLoggedIn = vi.fn();
    render(<LoginView onLoggedIn={onLoggedIn} />);

    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email');
    await userEvent.type(screen.getByLabelText(/password/i), 'whatever password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(loginMock).not.toHaveBeenCalled();
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it('logs in and reports the user back to the parent on valid submit (happy path)', async () => {
    const user = {
      id: '1',
      email: 'alice@example.com',
      displayName: 'Alice',
      locale: 'en' as const,
    };
    loginMock.mockResolvedValueOnce(user);
    const onLoggedIn = vi.fn();
    render(<LoginView onLoggedIn={onLoggedIn} />);

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a very strong password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(loginMock).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'a very strong password',
    });
    await vi.waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith(user));
  });

  it('shows the server error and does not call onLoggedIn when login rejects (edge case)', async () => {
    loginMock.mockRejectedValueOnce(new ApiError(401, 'Invalid email or password'));
    const onLoggedIn = vi.fn();
    render(<LoginView onLoggedIn={onLoggedIn} />);

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong password entirely');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(onLoggedIn).not.toHaveBeenCalled();
  });
});
