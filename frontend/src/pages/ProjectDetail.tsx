import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  addMember,
  downloadProjectExportCsv,
  getProject,
  listProjectTasks,
  removeMember,
  updateMemberRole,
} from '../api/projects';
import { assignTask, uploadTaskAudio } from '../api/tasks';
import { listUsers } from '../api/users';
import { apiErrorMessage } from '../api/client';
import type { Project, ProjectMember, ProjectRole, Task, User } from '../types';
import { StatusBadge } from '../components/StatusBadge';

type Tab = 'tasks' | 'members' | 'settings';

function memberLabel(member: ProjectMember): string {
  if (typeof member.user === 'string') return member.user;
  return `${member.user.name} (${member.user.email})`;
}

function memberUserId(member: ProjectMember): string {
  return typeof member.user === 'string' ? member.user : member.user.id;
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<Tab>('tasks');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const [projectData, taskData] = await Promise.all([getProject(id), listProjectTasks(id)]);
    setProject(projectData);
    setTasks(taskData);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load().catch((err) => {
      setError(apiErrorMessage(err, 'Could not load project'));
      setLoading(false);
    });
  }, [load]);

  if (loading) return <p className="hint">Loading…</p>;
  if (!project) return <p className="empty">{error ?? 'Project not found'}</p>;

  const myMembership = project.members.find((m) => memberUserId(m) === user?.id);
  const isProjectAdmin = user?.role === 'super_admin' || myMembership?.projectRole === 'admin';

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{project.name}</h2>
          <p className="hint">{project.description ?? 'No description'}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="tabs">
        <button className={`tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
          Tasks ({tasks.length})
        </button>
        <button className={`tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>
          Members ({project.members.length})
        </button>
        {isProjectAdmin && (
          <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
            Settings & export
          </button>
        )}
      </div>

      {tab === 'tasks' && (
        <TasksTab
          project={project}
          tasks={tasks}
          isProjectAdmin={isProjectAdmin}
          onTaskCreated={load}
          onTaskUpdated={load}
        />
      )}
      {tab === 'members' && (
        <MembersTab project={project} isProjectAdmin={isProjectAdmin} onChange={load} />
      )}
      {tab === 'settings' && isProjectAdmin && <SettingsTab project={project} />}
    </div>
  );
}

function TasksTab({
  project,
  tasks,
  isProjectAdmin,
  onTaskCreated,
  onTaskUpdated,
}: {
  project: Project;
  tasks: Task[];
  isProjectAdmin: boolean;
  onTaskCreated: () => void;
  onTaskUpdated: () => void;
}) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState(project.language ?? '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await uploadTaskAudio(project._id, file, { language: language || undefined });
      setFile(null);
      onTaskCreated();
    } catch (err) {
      setError(apiErrorMessage(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  }

  const annotators = project.members.filter((m) => m.projectRole === 'annotator' || m.projectRole === 'admin');
  const reviewers = project.members.filter((m) => m.projectRole === 'reviewer' || m.projectRole === 'admin');

  async function handleAssign(taskId: string, field: 'assignedAnnotator' | 'assignedReviewer', value: string) {
    await assignTask(taskId, { [field]: value || null });
    onTaskUpdated();
  }

  return (
    <div>
      {isProjectAdmin && (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Upload audio</h3>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleUpload} className="btn-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="audio">Audio file</label>
              <input
                id="audio"
                type="file"
                accept="audio/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="field" style={{ marginBottom: 0, width: 120 }}>
              <label htmlFor="lang">Language</label>
              <input id="lang" type="text" value={language} onChange={(e) => setLanguage(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!file || uploading}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </form>
          <p className="hint" style={{ marginTop: 10 }}>
            Preprocessing (music removal, speech segmentation, diarization, transcription) runs in the
            background — refresh the list to see status update.
          </p>
        </div>
      )}

      <div className="card">
        {tasks.length === 0 ? (
          <p className="empty">No tasks yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Audio</th>
                <th>Status</th>
                <th>Annotator</th>
                <th>Reviewer</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task._id}>
                  <td>{task.language ?? '—'}</td>
                  <td>
                    <StatusBadge status={task.status} />
                  </td>
                  <td>
                    {isProjectAdmin ? (
                      <select
                        value={task.assignedAnnotator ?? ''}
                        onChange={(e) => handleAssign(task._id, 'assignedAnnotator', e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {annotators.map((m) => (
                          <option key={memberUserId(m)} value={memberUserId(m)}>
                            {memberLabel(m)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      task.assignedAnnotator ?? '—'
                    )}
                  </td>
                  <td>
                    {isProjectAdmin ? (
                      <select
                        value={task.assignedReviewer ?? ''}
                        onChange={(e) => handleAssign(task._id, 'assignedReviewer', e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {reviewers.map((m) => (
                          <option key={memberUserId(m)} value={memberUserId(m)}>
                            {memberLabel(m)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      task.assignedReviewer ?? '—'
                    )}
                  </td>
                  <td>
                    {task.assignedAnnotator === user?.id && (
                      <Link className="btn btn-secondary btn-sm" to={`/tasks/${task._id}/annotate`}>
                        Annotate
                      </Link>
                    )}
                    {task.assignedReviewer === user?.id && (
                      <Link className="btn btn-secondary btn-sm" to={`/tasks/${task._id}/review`}>
                        Review
                      </Link>
                    )}
                    {isProjectAdmin && task.assignedAnnotator !== user?.id && task.assignedReviewer !== user?.id && (
                      <Link className="btn btn-secondary btn-sm" to={`/tasks/${task._id}/annotate`}>
                        View
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MembersTab({
  project,
  isProjectAdmin,
  onChange,
}: {
  project: Project;
  isProjectAdmin: boolean;
  onChange: () => void;
}) {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<User[] | null>(null);
  const [userId, setUserId] = useState('');
  const [projectRole, setProjectRole] = useState<ProjectRole>('annotator');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'super_admin') {
      listUsers()
        .then(setAllUsers)
        .catch(() => setAllUsers(null));
    }
  }, [user]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setError(null);
    setSubmitting(true);
    try {
      await addMember(project._id, { userId, projectRole });
      setUserId('');
      onChange();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not add member'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(memberId: string, role: ProjectRole) {
    await updateMemberRole(project._id, memberId, role);
    onChange();
  }

  async function handleRemove(memberId: string) {
    await removeMember(project._id, memberId);
    onChange();
  }

  const existingIds = new Set(project.members.map(memberUserId));
  const candidateUsers = (allUsers ?? []).filter((u) => !existingIds.has(u.id) && u.status === 'approved');

  return (
    <div>
      {isProjectAdmin && (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Add member</h3>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleAdd} className="btn-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
              <label htmlFor="member">User</label>
              {allUsers ? (
                <select id="member" value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">Select a user…</option>
                  {candidateUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="member"
                  type="text"
                  placeholder="User ID"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                />
              )}
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="role">Project role</label>
              <select id="role" value={projectRole} onChange={(e) => setProjectRole(e.target.value as ProjectRole)}>
                <option value="annotator">Annotator</option>
                <option value="reviewer">Reviewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={!userId || submitting}>
              Add
            </button>
          </form>
          {!allUsers && (
            <p className="hint" style={{ marginTop: 10 }}>
              Only Admin/Super Admin accounts can browse the full user list — ask one for the user's ID, or
              have them add the member instead.
            </p>
          )}
        </div>
      )}

      <div className="card">
        {project.members.map((member) => {
          const memberId = memberUserId(member);
          return (
            <div className="list-row" key={memberId}>
              <div>
                <div className="title">{memberLabel(member)}</div>
                <div className="meta">Added {new Date(member.addedAt).toLocaleDateString()}</div>
              </div>
              {isProjectAdmin ? (
                <div className="btn-row" style={{ alignItems: 'center' }}>
                  <select
                    value={member.projectRole}
                    onChange={(e) => handleRoleChange(memberId, e.target.value as ProjectRole)}
                  >
                    <option value="annotator">Annotator</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="btn btn-danger btn-sm" onClick={() => handleRemove(memberId)}>
                    Remove
                  </button>
                </div>
              ) : (
                <span className="badge">{member.projectRole}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsTab({ project }: { project: Project }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setDownloading(true);
    try {
      const blob = await downloadProjectExportCsv(project._id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, '-').toLowerCase()}-export.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err, 'Export failed'));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 8 }}>Export accepted corpus</h3>
      <p className="hint" style={{ marginBottom: 16 }}>
        Downloads a CSV of every task with status <code>accepted</code>, including the accepted RSML text.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <button className="btn btn-primary" onClick={handleExport} disabled={downloading}>
        {downloading ? 'Preparing…' : 'Download CSV'}
      </button>
    </div>
  );
}
