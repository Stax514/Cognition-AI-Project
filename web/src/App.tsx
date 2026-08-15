import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import { LoginPage } from './pages/LoginPage';
import { RefundsListPage } from './pages/RefundsListPage';
import { RefundDetailPage } from './pages/RefundDetailPage';
import { TopBar } from './components/TopBar';
import type { User } from './types';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Restore the session on load; the cookie is httpOnly so the server decides.
  useEffect(() => {
    api
      .me()
      .then(({ user: me }) => setUser(me))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
    navigate('/login');
  }

  if (loading) {
    return <p className="loading">Loading…</p>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={setUser} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <TopBar user={user} onLogout={handleLogout} />
      <main className="page">
        <Routes>
          <Route path="/refunds" element={<RefundsListPage user={user} />} />
          <Route path="/refunds/:id" element={<RefundDetailPage user={user} />} />
          <Route path="*" element={<Navigate to="/refunds" replace />} />
        </Routes>
      </main>
    </>
  );
}
