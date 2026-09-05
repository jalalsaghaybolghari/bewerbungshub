import { Navigate, Route, Routes, Outlet } from 'react-router-dom';
import { LoginPage } from './auth/LoginPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { useAuth } from './auth/AuthContext';
import { AdminPage } from './admin/AdminPage';

function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="flex items-center justify-between border-b border-slate/15 bg-white px-6 py-3">
      <span className="font-bold text-ink">BewerbungsHub Admin</span>
      <div className="flex items-center gap-3 text-sm text-slate">
        <span>{user?.email}</span>
        <button onClick={() => void logout()} className="hover:text-ink">
          Log out
        </button>
      </div>
    </header>
  );
}

function Layout() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="p-8">
        <Outlet />
      </main>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<AdminPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
