import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const logoutMock = vi.fn();
let authState: {
  user: { id: string; email: string; displayName: string; locale: 'en' | 'de' } | null;
  isLoading: boolean;
};

vi.mock('../lib/auth', () => ({
  useAuthState: () => authState,
  logout: (...args: unknown[]) => logoutMock(...args),
}));

vi.mock('./LoginView', () => ({
  LoginView: ({ onLoggedIn }: { onLoggedIn: (u: unknown) => void }) => (
    <button
      onClick={() =>
        onLoggedIn({ id: '1', email: 'alice@example.com', displayName: 'Alice', locale: 'en' })
      }
    >
      mock login
    </button>
  ),
}));

vi.mock('./CaptureView', () => ({
  CaptureView: () => <div>mock capture view</div>,
}));

describe('App', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the refresh-on-mount check is in flight (edge case)', () => {
    authState = { user: null, isLoading: true };
    render(<App />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows the login view when no session was recovered (negative case)', () => {
    authState = { user: null, isLoading: false };
    render(<App />);

    expect(screen.getByRole('button', { name: /mock login/i })).toBeInTheDocument();
  });

  it('shows the capture view once a session is recovered, and logging out returns to the login view (happy path)', async () => {
    authState = {
      user: { id: '1', email: 'bob@example.com', displayName: 'Bob', locale: 'en' },
      isLoading: false,
    };
    logoutMock.mockResolvedValueOnce(undefined);
    render(<App />);

    expect(screen.getByText(/mock capture view/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));

    expect(logoutMock).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: /mock login/i })).toBeInTheDocument(),
    );
  });
});
