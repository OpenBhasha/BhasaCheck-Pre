import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="empty">
      <p>Page not found.</p>
      <Link to="/dashboard">Go to dashboard</Link>
    </div>
  );
}
