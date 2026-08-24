import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { PendingApproval } from './pages/PendingApproval';
import { Dashboard } from './pages/Dashboard';
import { ProjectsList } from './pages/ProjectsList';
import { ProjectNew } from './pages/ProjectNew';
import { ProjectDetail } from './pages/ProjectDetail';
import { TaskAnnotate } from './pages/TaskAnnotate';
import { TaskReview } from './pages/TaskReview';
import { AdminUsers } from './pages/AdminUsers';
import { Profile } from './pages/Profile';
import { NotFound } from './pages/NotFound';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
      <Route path="/pending-approval" element={<PendingApproval />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectsList />} />
          <Route path="/projects/new" element={<ProjectNew />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/tasks/:id/annotate" element={<TaskAnnotate />} />
          <Route path="/tasks/:id/review" element={<TaskReview />} />
          <Route path="/profile" element={<Profile />} />

          <Route element={<ProtectedRoute roles={['admin', 'super_admin']} />}>
            <Route path="/admin/users" element={<AdminUsers />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
