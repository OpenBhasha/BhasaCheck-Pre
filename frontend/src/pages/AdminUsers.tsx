import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  approveUser,
  changeUserRole,
  deactivateUser,
  listPendingUsers,
  listUsers,
  reactivateUser,
  rejectUser,
} from '../api/users';
import { apiErrorMessage } from '../api/client';
import type { GlobalRole, User } from '../types';
import { StatusBadge } from '../components/StatusBadge';

const ROLES: GlobalRole[] = ['annotator', 'reviewer', 'admin', 'super_admin'];

export function AdminUsers() {
  const { user: me } = useAuth();
  const [pending, setPending] = useState<User[]>([]);
  const [all, setAll] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [pendingUsers, everyone] = await Promise.all([listPendingUsers(), listUsers()]);
    setPending(pendingUsers);
    setAll(everyone);
  }, []);

  useEffect(() => {
    load()
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (loading) return <p className="hint">Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <h2>Manage users</h2>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="section-title">Pending approval ({pending.length})</div>
      <div className="card">
        {pending.length === 0 ? (
          <p className="empty">No pending accounts.</p>
        ) : (
          pending.map((u) => (
            <div className="list-row" key={u.id}>
              <div>
                <div className="title">{u.name}</div>
                <div className="meta">{u.email}</div>
              </div>
              <div className="btn-row">
                <button className="btn btn-primary btn-sm" onClick={() => run(() => approveUser(u.id))}>
                  Approve
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => run(() => rejectUser(u.id))}>
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="section-title">All users ({all.length})</div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {all.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  {me?.role === 'super_admin' && u.id !== me.id ? (
                    <select value={u.role} onChange={(e) => run(() => changeUserRole(u.id, e.target.value as GlobalRole))}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    u.role.replace('_', ' ')
                  )}
                </td>
                <td>
                  <StatusBadge status={u.status} />
                </td>
                <td>
                  {u.status === 'deactivated' ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => run(() => reactivateUser(u.id))}>
                      Reactivate
                    </button>
                  ) : u.id !== me?.id ? (
                    <button className="btn btn-danger btn-sm" onClick={() => run(() => deactivateUser(u.id))}>
                      Deactivate
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
