import { Navigate } from 'react-router-dom'
import {
  getDashboardPathForRole,
  getStoredRole,
  isAuthenticated,
  normalizeRole,
} from '../lib/auth.js'

function ProtectedRoute({ children, allowedRoles }) {
  const storedRole = getStoredRole()

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }

  const normalizedAllowedRoles = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
    .filter(Boolean)
    .map((role) => normalizeRole(role))

  if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(storedRole)) {
    return <Navigate to={getDashboardPathForRole(storedRole)} replace />
  }

  return children
}

export default ProtectedRoute
