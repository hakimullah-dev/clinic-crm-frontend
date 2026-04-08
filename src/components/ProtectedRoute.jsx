import { Navigate } from 'react-router-dom'

const hasValidToken = () => {
  const rawToken = localStorage.getItem('clinic_token')

  if (!rawToken) {
    return false
  }

  const token = String(rawToken).trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '')
  return Boolean(token)
}

const dashboardByRole = {
  admin: '/admin',
  doctor: '/doctor',
  receptionist: '/receptionist',
  patient: '/patient',
}

function ProtectedRoute({ children, role }) {
  const storedUser = localStorage.getItem('clinic_user')
  const storedRole = localStorage.getItem('clinic_role')
  const hasToken = hasValidToken()

  if (!storedUser || !storedRole || !hasToken) {
    return <Navigate to="/login" replace />
  }

  if (storedRole !== role) {
    return <Navigate to={dashboardByRole[storedRole] ?? '/login'} replace />
  }

  return children
}

export default ProtectedRoute
