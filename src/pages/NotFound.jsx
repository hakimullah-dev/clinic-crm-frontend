import { Link } from 'react-router-dom'
import { getDashboardPathForRole, getStoredRole, isAuthenticated } from '../lib/auth.js'

function NotFound() {
  const role = getStoredRole()
  const authenticated = isAuthenticated()

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-700">Clinic CRM</p>
        <h1 className="mt-4 text-4xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The page you tried to open does not exist or may have moved.
        </p>
        {authenticated ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current role</p>
            <p className="mt-2 text-base font-medium text-slate-900">{role || 'Unknown'}</p>
          </div>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-3">
          {authenticated ? (
            <Link
              className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
              to={getDashboardPathForRole(role)}
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
              to="/login"
            >
              Go to Login
            </Link>
          )}
        </div>
      </section>
    </main>
  )
}

export default NotFound
