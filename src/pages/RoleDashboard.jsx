import { useNavigate } from 'react-router-dom'
import {
  clearStoredAuth,
  getDashboardPathForRole,
  getStoredRole,
  getStoredUser,
} from '../lib/auth.js'

function formatRoleLabel(role) {
  return String(role || 'user')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function RoleDashboard() {
  const navigate = useNavigate()
  const role = getStoredRole()
  const user = getStoredUser()
  const dashboardPath = getDashboardPathForRole(role)
  const email = user?.email || 'user@clinic.com'

  const handleLogout = () => {
    clearStoredAuth()
    navigate('/login', { replace: true })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-700">
          Clinic CRM
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900">
          {formatRoleLabel(role)} dashboard
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This account is signed in successfully and routed to <strong>{dashboardPath}</strong>.
          A custom dashboard is not implemented for this role in the frontend yet, but the
          session is valid and stays active.
        </p>

        <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Signed in as</p>
          <p className="mt-2 text-base font-medium text-slate-900">{email}</p>
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">Role key</p>
          <p className="mt-2 text-base font-medium text-slate-900">{role}</p>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
            onClick={handleLogout}
            type="button"
          >
            Logout
          </button>
        </div>
      </section>
    </main>
  )
}

export default RoleDashboard
