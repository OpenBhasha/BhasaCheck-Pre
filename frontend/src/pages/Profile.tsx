import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { changeMyPassword, updateMe } from '../api/users';
import { apiErrorMessage } from '../api/client';

export function Profile() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameSaved(false);
    setNameSaving(true);
    try {
      const updated = await updateMe({ name });
      setUser(updated);
      setNameSaved(true);
    } catch (err) {
      setNameError(apiErrorMessage(err));
    } finally {
      setNameSaving(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);
    setPasswordSaving(true);
    try {
      await changeMyPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(apiErrorMessage(err));
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Profile</h2>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Account</h3>
          <p className="hint">Email: {user?.email}</p>
          <p className="hint" style={{ marginBottom: 16 }}>
            Role: {user?.role.replace('_', ' ')}
          </p>

          {nameError && <div className="error-banner">{nameError}</div>}
          <form onSubmit={handleNameSubmit}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={nameSaving}>
              {nameSaving ? 'Saving…' : 'Save name'}
            </button>
            {nameSaved && <span className="hint" style={{ marginLeft: 10 }}>Saved.</span>}
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Change password</h3>
          {passwordError && <div className="error-banner">{passwordError}</div>}
          <form onSubmit={handlePasswordSubmit}>
            <div className="field">
              <label htmlFor="currentPassword">Current password</label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={passwordSaving}>
              {passwordSaving ? 'Saving…' : 'Update password'}
            </button>
            {passwordSaved && <span className="hint" style={{ marginLeft: 10 }}>Updated.</span>}
          </form>
        </div>
      </div>
    </div>
  );
}
