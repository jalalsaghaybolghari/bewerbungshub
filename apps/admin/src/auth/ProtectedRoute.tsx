import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Combines what apps/web needs two components for (ProtectedRoute +
// AdminRoute) into one, since this whole app *is* the admin app — there's
// no non-admin destination to fall back to here.
export function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center text-slate">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!user.isAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-slate">
        <p className="text-lg font-semibold text-ink">Not authorized</p>
        <p className="text-sm">Your account doesn't have admin access.</p>
      </div>
    );
  }
  return <Outlet />;
}
