import { Link } from 'react-router-dom';
import type { User } from '../types';

export function TopBar({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <header className="topbar">
      <Link to="/refunds" className="topbar-title">
        Refunds Review
      </Link>
      <div className="topbar-user">
        <span>
          {user.name} · <span className="role-chip">{user.role}</span>
        </span>
        <button type="button" onClick={onLogout} className="button subtle">
          Sign out
        </button>
      </div>
    </header>
  );
}
