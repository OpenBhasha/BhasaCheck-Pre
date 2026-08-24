import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function PendingApproval() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand">Waiting for approval</div>
        <p className="subtitle">
          Hi {user?.name ?? 'there'} — your account ({user?.email}) is still{' '}
          <strong>{user?.status ?? 'pending'}</strong>. A Project Admin or Super Admin needs to approve it
          before you can sign in and see your dashboard.
        </p>
        <button className="btn btn-secondary btn-block" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
