import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Widget } from './Widget';

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

describe('Widget', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the refresh-on-mount check is in flight (edge case)', () => {
    authState = { user: null, isLoading: true };
    render(<Widget url="https://example.com/job" onClose={vi.fn()} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows the login view when no session was recovered (negative case)', () => {
    authState = { user: null, isLoading: false };
    render(<Widget url="https://example.com/job" onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /mock login/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();
  });

  it('shows the capture view once a session is recovered, and logging out returns to the login view (happy path)', async () => {
    authState = {
      user: { id: '1', email: 'bob@example.com', displayName: 'Bob', locale: 'en' },
      isLoading: false,
    };
    logoutMock.mockResolvedValueOnce(undefined);
    render(<Widget url="https://example.com/job" onClose={vi.fn()} />);

    expect(screen.getByText(/mock capture view/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /bewerbungshub/i })).toHaveAttribute(
      'href',
      'https://bewerbungshub.com/dashboard',
    );

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));

    expect(logoutMock).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: /mock login/i })).toBeInTheDocument(),
    );
  });

  it('calls onClose when the close button is clicked (happy path)', async () => {
    authState = { user: null, isLoading: false };
    const onClose = vi.fn();
    render(<Widget url="https://example.com/job" onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('shows a refresh banner when a new job is detected, and calls onRefresh when clicked (happy path)', async () => {
    authState = {
      user: { id: '1', email: 'bob@example.com', displayName: 'Bob', locale: 'en' },
      isLoading: false,
    };
    const onRefresh = vi.fn();
    render(
      <Widget
        url="https://example.com/job"
        newJobAvailable
        onRefresh={onRefresh}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/a different job was found/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));

    expect(onRefresh).toHaveBeenCalled();
  });

  it('does not show the refresh banner when no new job was detected (negative case)', () => {
    authState = {
      user: { id: '1', email: 'bob@example.com', displayName: 'Bob', locale: 'en' },
      isLoading: false,
    };
    render(<Widget url="https://example.com/job" onClose={vi.fn()} />);

    expect(screen.queryByText(/a different job was found/i)).not.toBeInTheDocument();
  });
});
