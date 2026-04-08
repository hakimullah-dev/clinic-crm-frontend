import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import api from '../lib/api.js'

const normalizeToken = (rawToken) => {
  if (!rawToken) {
    return ''
  }

  let token = String(rawToken).trim()

  if (token.startsWith('Bearer ')) {
    token = token.slice(7).trim()
  }

  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim()
  }

  return token
}

const dashboardByRole = {
  admin: '/admin',
  doctor: '/doctor',
  receptionist: '/receptionist',
  patient: '/patient',
}

function LoginPage() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const existingRole = localStorage.getItem('clinic_role')

  if (existingRole && dashboardByRole[existingRole]) {
    return <Navigate to={dashboardByRole[existingRole]} replace />
  }

  const handleChange = (event) => {
    const { name, value } = event.target

    setFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await api.post('/api/auth/login', formData)
      const { token: rawToken, user, role } = response.data
      const token = normalizeToken(rawToken)
      const targetRoute = dashboardByRole[role]

      if (!token) {
        throw new Error('No authentication token returned from login.')
      }

      localStorage.setItem('clinic_token', token)
      localStorage.setItem('clinic_user', JSON.stringify(user))
      localStorage.setItem('clinic_role', role)

      navigate(targetRoute ?? '/login', { replace: true })
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ??
          'Unable to sign in. Please check your credentials and try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white/80 shadow-2xl shadow-cyan-950/10 backdrop-blur md:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden overflow-hidden bg-slate-950 px-10 py-12 text-slate-50 md:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,211,238,0.35),_transparent_32%),linear-gradient(145deg,_rgba(15,23,42,0.96),_rgba(12,74,110,0.92))]" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">
                Clinic CRM
              </p>
              <h1 className="mt-6 max-w-sm text-4xl font-semibold leading-tight">
                One login for every desk in your care workflow.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">
                Secure access for administrators, doctors, reception teams, and
                patients in a single streamlined portal.
              </p>
            </div>

            <div className="grid gap-4 text-sm text-slate-200">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Fast handoff between appointments, billing, and records.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Role-based access keeps each workspace focused and safe.
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-8 sm:px-10 sm:py-12">
          <div className="mx-auto flex max-w-md flex-col justify-center">
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-cyan-700">
              Welcome back
            </p>
            <h2 className="mt-4 text-3xl font-semibold text-slate-900">
              Sign in to continue
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Use your clinic credentials to open the dashboard that matches
              your role.
            </p>

            <form className="mt-10 space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Email address
                </span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@clinic.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Password
                </span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
              </label>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <button
                className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-sm text-slate-500">
              Need help accessing your account? Contact your clinic
              administrator.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}

export default LoginPage
