import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';

let user: { isAdmin: boolean } | null = null;
let isLoading = false;

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user, isLoading }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>Admin page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  afterEach(() => {
    user = null;
    isLoading = false;
  });

  it('shows a loading state while auth is resolving (edge case)', () => {
    isLoading = true;
    renderAt('/');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('redirects a logged-out user to /login (negative case)', () => {
    renderAt('/');
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('shows a not-authorized message for a logged-in non-admin (negative case)', () => {
    user = { isAdmin: false };
    renderAt('/');
    expect(screen.getByText(/not authorized/i)).toBeInTheDocument();
  });

  it('renders the route for an admin user (happy path)', () => {
    user = { isAdmin: true };
    renderAt('/');
    expect(screen.getByText('Admin page')).toBeInTheDocument();
  });
});
