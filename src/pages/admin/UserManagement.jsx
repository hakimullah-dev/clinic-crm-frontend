import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import EmptyState from '../../components/ui/EmptyState.jsx'
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx'
import Pagination from '../../components/ui/Pagination.jsx'
import { getDoctors } from '../../services/doctors.js'
import { getPatients } from '../../services/patients.js'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'receptionists', label: 'Receptionists' },
  { key: 'patients', label: 'Patients' },
]

const PAGE_SIZE = 10

const ensureArray = (value) => (Array.isArray(value) ? value : [])

const firstValue = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '')

const normalizeDoctor = (doctor = {}) => ({
  id: firstValue(doctor.id, doctor._id, doctor.doctor_id, ''),
  name: firstValue(doctor.full_name, doctor.name, 'Unnamed doctor'),
  email: firstValue(doctor.email, 'No email'),
  role: 'doctor',
})

const normalizePatient = (patient = {}) => ({
  id: firstValue(patient.id, patient._id, patient.patient_id, ''),
  name: firstValue(patient.full_name, patient.name, 'Unnamed patient'),
  email: firstValue(patient.email, 'No email'),
  role: 'patient',
})

function UserManagement() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const doctorsQuery = useQuery({
    queryKey: ['admin', 'user-management', 'doctors'],
    queryFn: async () => {
      const data = await getDoctors()
      return ensureArray(data.doctors || data).map(normalizeDoctor)
    },
  })

  const patientsQuery = useQuery({
    queryKey: ['admin', 'user-management', 'patients', page, search],
    queryFn: async () => {
      const data = await getPatients(page, search)
      return ensureArray(data.patients || data).map(normalizePatient)
    },
  })

  const allUsers = useMemo(
    () => [...(doctorsQuery.data || []), ...(patientsQuery.data || [])],
    [doctorsQuery.data, patientsQuery.data],
  )

  const filteredUsers = useMemo(() => {
    const source =
      activeTab === 'doctors'
        ? doctorsQuery.data || []
        : activeTab === 'patients'
          ? patientsQuery.data || []
          : activeTab === 'receptionists'
            ? []
            : allUsers

    const needle = search.trim().toLowerCase()
    if (!needle) {
      return source
    }

    return source.filter(
      (user) =>
        String(user.name).toLowerCase().includes(needle) ||
        String(user.email).toLowerCase().includes(needle),
    )
  }, [activeTab, allUsers, doctorsQuery.data, patientsQuery.data, search])

  const paginatedUsers = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE
    return filteredUsers.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredUsers, page])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const isLoading = doctorsQuery.isLoading || patientsQuery.isLoading

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">
              Admin
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">User Management</h1>
            <p className="mt-2 text-sm text-slate-600">
              Review doctors and patients in one place. Receptionist listing is shown only when an
              endpoint becomes available.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              to="/admin?section=settings"
            >
              Add Receptionist
            </Link>
            <Link
              className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
              to="/admin?section=doctors&openDoctor=1"
            >
              Add Doctor
            </Link>
          </div>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                onClick={() => {
                  setActiveTab(tab.key)
                  setPage(1)
                }}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <input
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search by name or email"
              type="text"
              value={search}
            />
            <button
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={() => navigate('/admin')}
              type="button"
            >
              Back to Dashboard
            </button>
          </div>

          <div className="mt-6">
            {activeTab === 'receptionists' ? (
              <EmptyState
                actionLabel="Go to Admin Dashboard"
                message="A receptionist list endpoint is not available, so this tab cannot show directory data yet."
                onAction={() => navigate('/admin?section=settings')}
                title="Receptionist Directory Unavailable"
              />
            ) : isLoading ? (
              <LoadingSpinner size="md" />
            ) : filteredUsers.length === 0 ? (
              <EmptyState
                title="No users found"
                message="Try a different search term or switch tabs."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                      <tr>
                        <th className="pb-3 pr-4 font-medium">Name</th>
                        <th className="pb-3 pr-4 font-medium">Email</th>
                        <th className="pb-3 pr-4 font-medium">Role</th>
                        <th className="pb-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((user) => (
                        <tr key={`${user.role}-${user.id}`} className="border-b border-slate-100">
                          <td className="py-4 pr-4 font-medium text-slate-900">{user.name}</td>
                          <td className="py-4 pr-4 text-slate-600">{user.email}</td>
                          <td className="py-4 pr-4 capitalize text-slate-600">{user.role}</td>
                          <td className="py-4">
                            <div className="flex flex-wrap gap-2">
                              <Link
                                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-700"
                                to={
                                  user.role === 'doctor'
                                    ? `/admin?section=doctors&doctorId=${user.id}`
                                    : `/admin?section=patients&patientId=${user.id}`
                                }
                              >
                                View
                              </Link>
                              {user.role === 'doctor' ? (
                                <Link
                                  className="rounded-xl bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100"
                                  to={`/admin?section=doctors&doctorId=${user.id}`}
                                >
                                  Open Doctor Detail
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

export default UserManagement
