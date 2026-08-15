import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { User } from '../types';

const SEEDED_USERS = [
  { email: 'viewer@example.com', role: 'viewer — read only' },
  { email: 'agent@example.com', role: 'agent — can raise refunds' },
  { email: 'approver@example.com', role: 'approver — can decide refunds' },
];

export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('approver@example.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { user } = await api.login(email, password);
      onLogin(user);
      navigate('/refunds');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrapper">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h1>Refunds Review</h1>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="button primary" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="hint">
          <p>Seeded accounts (development):</p>
          <ul>
            {SEEDED_USERS.map((user) => (
              <li key={user.email}>
                <button type="button" className="linkish" onClick={() => setEmail(user.email)}>
                  {user.email}
                </button>{' '}
                — {user.role}
              </li>
            ))}
          </ul>
          <p>Password is the SEED_PASSWORD value from your .env file.</p>
        </div>
      </form>
    </div>
  );
}
