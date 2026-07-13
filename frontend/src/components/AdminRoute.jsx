import { Navigate } from 'react-router-dom';

// Guards routes that require an admin session. Only checks for the
// presence of a token in localStorage — if the token is invalid/expired,
// the first admin API call will 401 and the page itself handles the
// redirect (see ApiKeysPage.jsx), same pattern used for other auth guards.
export default function AdminRoute({ children }) {
  const token = localStorage.getItem('adminToken');

  if (!token) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}
