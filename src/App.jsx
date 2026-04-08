import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import {
  getDashboardPathForRole,
  getStoredRole,
  isAuthenticated,
} from './lib/auth.js'
import AdminDashboard from './pages/AdminDashboard.jsx'
import DoctorDashboard from './pages/DoctorDashboard.jsx'
import LoginPage from './pages/LoginPage.jsx'
import PatientPortal from './pages/PatientPortal.jsx'
import ReceptionistDashboard from './pages/ReceptionistDashboard.jsx'
import RoleDashboard from './pages/RoleDashboard.jsx'

function AuthenticatedHomeRedirect() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={getDashboardPathForRole(getStoredRole())} replace />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthenticatedHomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/doctor"
        element={
          <ProtectedRoute allowedRoles="doctor">
            <DoctorDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/receptionist"
        element={
          <ProtectedRoute allowedRoles="receptionist">
            <ReceptionistDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patient"
        element={
          <ProtectedRoute allowedRoles="patient">
            <PatientPortal />
          </ProtectedRoute>
        }
      />
      <Route
        path="/:role"
        element={
          <ProtectedRoute>
            <RoleDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<AuthenticatedHomeRedirect />} />
    </Routes>
  )
}

export default App
