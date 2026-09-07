import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
import { assignTask, deleteTask, downloadTaskSrt, uploadTaskAudio } from '../api/tasks';
import { createAnnotation, updateAnnotation } from '../api/annotations';
import { listUsers } from '../api/users';
import { apiErrorMessage } from '../api/client';
import { downloadBlob } from '../lib/downloadBlob';
import type { AudioStorageProvider, Project, ProjectMember, ProjectRole, Task, User } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { RsmlEditor, type RsmlEditorHandle } from '../components/RsmlEditor';

type Tab = 'tasks' | 'overview' | 'members' | 'settings';

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
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
          RSML Overview
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
      {tab === 'overview' && <OverviewTab project={project} tasks={tasks} onTaskUpdated={load} />}
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
  const [storageProvider, setStorageProvider] = useState<AudioStorageProvider | ''>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await uploadTaskAudio(project._id, file, {
        language: language || undefined,
        storageProvider: storageProvider || undefined,
      });
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

  async function handleDelete(taskId: string) {
    if (!window.confirm('Delete this task? This removes its audio, dataset, and all annotations — cannot be undone.')) {
      return;
    }
    await deleteTask(taskId);
    onTaskUpdated();
  }

  async function handleDownloadSrt(taskId: string) {
    setError(null);
    try {
      const blob = await downloadTaskSrt(taskId);
      downloadBlob(blob, `task-${taskId}.srt`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not download SRT — transcription may not be complete yet'));
    }
  }

  return (
    <div>
      {error && !isProjectAdmin && <div className="error-banner">{error}</div>}
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
            <div className="field" style={{ marginBottom: 0, width: 160 }}>
              <label htmlFor="storageProvider">Storage</label>
              <select
                id="storageProvider"
                value={storageProvider}
                onChange={(e) => setStorageProvider(e.target.value as AudioStorageProvider | '')}
              >
                <option value="">Server default</option>
                <option value="cloudinary">Cloudinary</option>
                <option value="local">Local disk</option>
              </select>
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
                    <div className="btn-row">
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
                      {task.dataset && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadSrt(task._id)}>
                          SRT
                        </button>
                      )}
                      {isProjectAdmin && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(task._id)}>
                          Delete
                        </button>
                      )}
                    </div>
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

function OverviewTab({
  project,
  tasks,
  onTaskUpdated,
}: {
  project: Project;
  tasks: Task[];
  onTaskUpdated: () => void;
}) {
  const { user } = useAuth();

  if (tasks.length === 0) {
    return (
      <div className="card">
        <p className="empty">No tasks yet.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="hint" style={{ marginBottom: 16 }}>
        Every task's RSML content, in one scroll — the accepted/submitted annotation where one exists,
        otherwise the ML-drafted/original text. Tasks assigned to you as annotator (and not yet
        accepted/rejected) are directly editable right here.
      </p>
      {tasks.map((task, index) => (
        <OverviewTaskCard
          key={task._id}
          task={task}
          index={index}
          project={project}
          currentUserId={user?.id}
          onSaved={onTaskUpdated}
        />
      ))}
    </div>
  );
}

function OverviewTaskCard({
  task,
  index,
  project,
  currentUserId,
  onSaved,
}: {
  task: Task;
  index: number;
  project: Project;
  currentUserId: string | undefined;
  onSaved: () => void;
}) {
  const editorRef = useRef<RsmlEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function memberName(userId: string | null): string {
    if (!userId) return 'Unassigned';
    const member = project.members.find((m) => memberUserId(m) === userId);
    return member ? memberLabel(member) : userId;
  }

  const annotation = task.currentAnnotation && typeof task.currentAnnotation === 'object'
    ? task.currentAnnotation
    : null;
  const rsmlText = annotation?.rsmlText || task.rsmlTextOriginal || '';

  const canEdit =
    currentUserId != null &&
    task.assignedAnnotator === currentUserId &&
    task.status !== 'accepted' &&
    task.status !== 'rejected';

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const text = editorRef.current?.getValue() ?? '';
      // createAnnotation is idempotent — returns the existing draft (200) or
      // opens a new one (201), so this is safe to call on every save.
      const draft = await createAnnotation({ taskId: task._id, type: 'annotation' });
      await updateAnnotation(draft._id, text);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>
            Task {index + 1}
            {task.language ? ` · ${task.language}` : ''}
            {task.speakerLabel ? ` · ${task.speakerLabel}` : ''}
          </h3>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Annotator: {memberName(task.assignedAnnotator)} · Reviewer: {memberName(task.assignedReviewer)}
            {annotation && ` · showing the ${annotation.status.replace(/_/g, ' ')} annotation`}
          </p>
        </div>
        <StatusBadge status={task.status} />
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls src={task.audioUrl} style={{ width: '100%', marginBottom: 12 }} />

      {rsmlText || canEdit ? (
        <RsmlEditor
          ref={editorRef}
          key={`${task._id}-${annotation?.status ?? 'original'}`}
          initialValue={rsmlText}
          editable={canEdit}
          height={160}
        />
      ) : (
        <p className="empty">No RSML content yet — preprocessing may still be running.</p>
      )}

      {error && (
        <div className="error-banner" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {canEdit && (
        <div className="btn-row" style={{ marginTop: 12, alignItems: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span className="hint">Saved.</span>}
        </div>
      )}
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
      downloadBlob(blob, `${project.name.replace(/\s+/g, '-').toLowerCase()}-export.csv`);
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
