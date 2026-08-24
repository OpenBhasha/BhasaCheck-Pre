import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listProjects, listProjectTasks } from '../api/projects';
import type { Project, Task } from '../types';
import { StatusBadge } from '../components/StatusBadge';

interface AssignedTask {
  task: Task;
  project: Project;
  role: 'annotator' | 'reviewer';
}

export function Dashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [assigned, setAssigned] = useState<AssignedTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const projectList = await listProjects();
      if (cancelled) return;
      setProjects(projectList);

      const perProject = await Promise.all(
        projectList.map(async (project) => {
          const tasks = await listProjectTasks(project._id, { assignedTo: user.id });
          return tasks.map((task): AssignedTask => ({
            task,
            project,
            role: task.assignedAnnotator === user.id ? 'annotator' : 'reviewer',
          }));
        })
      );
      if (!cancelled) {
        setAssigned(perProject.flat());
        setLoading(false);
      }
    })().catch(() => setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div>
      <div className="page-header">
        <h2>Welcome back, {user?.name}</h2>
      </div>

      <div className="section-title">Your tasks</div>
      <div className="card">
        {loading ? (
          <p className="hint">Loading…</p>
        ) : assigned.length === 0 ? (
          <p className="empty">No tasks assigned to you yet.</p>
        ) : (
          assigned.map(({ task, project, role }) => (
            <div className="list-row" key={task._id + role}>
              <div>
                <div className="title">{project.name}</div>
                <div className="meta">
                  {task.language ?? 'unspecified language'} · as {role}
                </div>
              </div>
              <div className="btn-row" style={{ alignItems: 'center' }}>
                <StatusBadge status={task.status} />
                <Link
                  className="btn btn-primary btn-sm"
                  to={role === 'annotator' ? `/tasks/${task._id}/annotate` : `/tasks/${task._id}/review`}
                >
                  Open
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="section-title">Your projects</div>
      <div className="card">
        {projects.length === 0 ? (
          <p className="empty">
            You're not a member of any project yet.{' '}
            {(user?.role === 'admin' || user?.role === 'super_admin') && (
              <Link to="/projects/new">Create one</Link>
            )}
          </p>
        ) : (
          projects.map((project) => (
            <div className="list-row" key={project._id}>
              <div>
                <div className="title">{project.name}</div>
                <div className="meta">{project.members.length} members</div>
              </div>
              <Link className="btn btn-secondary btn-sm" to={`/projects/${project._id}`}>
                View
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
