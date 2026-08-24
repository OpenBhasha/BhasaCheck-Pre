import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProjects } from '../api/projects';
import type { Project } from '../types';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/StatusBadge';

export function ProjectsList() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  const canCreate = user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <div>
      <div className="page-header">
        <h2>Projects</h2>
        {canCreate && (
          <Link to="/projects/new" className="btn btn-primary">
            New project
          </Link>
        )}
      </div>

      <div className="card">
        {loading ? (
          <p className="hint">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="empty">No projects yet.</p>
        ) : (
          projects.map((project) => (
            <div className="list-row" key={project._id}>
              <div>
                <div className="title">{project.name}</div>
                <div className="meta">
                  {project.language ?? 'no language set'} · {project.members.length} members
                </div>
              </div>
              <div className="btn-row" style={{ alignItems: 'center' }}>
                <StatusBadge status={project.status} />
                <Link className="btn btn-secondary btn-sm" to={`/projects/${project._id}`}>
                  Open
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
