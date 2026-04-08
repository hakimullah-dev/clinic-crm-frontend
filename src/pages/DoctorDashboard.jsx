
import { useMemo, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api.js'

const NAV_ITEMS = [
  { key: 'today', label: "Today's Schedule", icon: '🏠' },
  { key: 'intake', label: 'Patient Intake', icon: '📋' },
  { key: 'schedule', label: 'My Schedule', icon: '📅' },
  { key: 'history', label: 'Patient History', icon: '👥' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
]

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const STATUS_STYLES = {
  confirmed: 'bg-sky-100 text-sky-700 ring-sky-200',
  completed: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  no_show: 'bg-orange-100 text-orange-700 ring-orange-200',
  pending: 'bg-amber-100 text-amber-800 ring-amber-200',
}

const inputClasses =
  'mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100'

const cardClasses = 'rounded-3xl border border-slate-200 bg-white shadow-sm'
const EMPTY_ARRAY = []

const ensureArray = (value, keys = []) => {
  if (Array.isArray(value)) return value

  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }

  return []
}

const firstValue = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '')

const formatDate = (value) => {
  if (!value) return 'N/A'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date)
}

const formatDateTime = (value) => {
  if (!value) return 'N/A'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const formatTime = (value) => {
  if (!value) return 'N/A'
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const getErrorMessage = (error, fallback = 'Something went wrong.') =>
  firstValue(
    error?.response?.data?.message,
    error?.response?.data?.error,
    error?.message,
    fallback,
  )

const normalizeAppointment = (appointment = {}) => ({
  id: firstValue(appointment.id, appointment._id, appointment.appointment_id, ''),
  patient_name: firstValue(
    appointment.patient_name,
    appointment.patientName,
    appointment.patient?.full_name,
    appointment.patient?.name,
    'Unknown patient',
  ),
  patient_id: firstValue(
    appointment.patient_id,
    appointment.patient?.id,
    appointment.patient?._id,
    '',
  ),
  date_time: firstValue(
    appointment.date_time,
    appointment.datetime,
    appointment.scheduled_at,
    appointment.date,
    '',
  ),
  status: firstValue(appointment.status, 'pending'),
  duration: Number(firstValue(appointment.duration, appointment.slot_duration_mins, 15)),
  notes: firstValue(appointment.notes, ''),
})

const normalizePatient = (patient = {}) => ({
  id: firstValue(patient.id, patient._id, patient.patient_id, ''),
  full_name: firstValue(patient.full_name, patient.name, 'Unnamed patient'),
  phone: firstValue(patient.phone, ''),
  email: firstValue(patient.email, ''),
})

const normalizeDoctor = (doctor = {}) => ({
  id: firstValue(doctor.id, doctor._id, doctor.doctor_id, doctor.email, ''),
  full_name: firstValue(doctor.full_name, doctor.name, 'Unnamed doctor'),
  specialty: firstValue(doctor.specialty, doctor.specialisation, 'General'),
  email: firstValue(doctor.email, ''),
  phone: firstValue(doctor.phone, ''),
  working_days: Array.isArray(doctor.working_days)
    ? doctor.working_days
    : Array.isArray(doctor.workingDays)
      ? doctor.workingDays
      : typeof firstValue(doctor.working_days, doctor.workingDays) === 'string'
        ? firstValue(doctor.working_days, doctor.workingDays)
            .split(',')
            .map((day) => day.trim())
            .filter(Boolean)
        : [],
  start_time: firstValue(doctor.start_time, doctor.startTime, ''),
  end_time: firstValue(doctor.end_time, doctor.endTime, ''),
  slot_duration_mins: Number(
    firstValue(doctor.slot_duration_mins, doctor.slotDurationMins, 15),
  ),
  is_active: Boolean(
    firstValue(doctor.is_active, doctor.active, doctor.status === 'active', true),
  ),
})

const normalizeIntake = (intake = {}) => ({
  symptoms: firstValue(intake.symptoms, intake.data?.symptoms, 'No symptoms provided'),
  current_medications: firstValue(
    intake.current_medications,
    intake.medications,
    intake.data?.current_medications,
    'No medications listed',
  ),
  allergies: firstValue(intake.allergies, intake.data?.allergies, 'No allergies recorded'),
  insurance_info: firstValue(
    intake.insurance_info,
    intake.insurance,
    intake.data?.insurance_info,
    'No insurance information',
  ),
  ai_summary: firstValue(intake.ai_summary, intake.data?.ai_summary, 'No AI summary available'),
})

const getAppointments = (payload) =>
  ensureArray(payload, ['appointments', 'data']).map(normalizeAppointment)

const getPatients = (payload) =>
  ensureArray(payload, ['patients', 'data']).map(normalizePatient)

const getDoctors = (payload) =>
  ensureArray(payload, ['doctors', 'data']).map(normalizeDoctor)

function StatusBadge({ status }) {
  const tone = STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 ring-slate-200'

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${tone}`}
    >
      {String(status || 'unknown').replaceAll('_', ' ')}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  )
}

function ErrorBanner({ message }) {
  if (!message) return null

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  )
}

function SectionShell({ title, description, action, children }) {
  return (
    <section className={cardClasses}>
      <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </section>
  )
}

function SlidingPanel({ open, title, onClose, children }) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/40 transition ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        role="presentation"
      />
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-2xl transform overflow-y-auto bg-white shadow-2xl transition duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            X
          </button>
        </div>
        <div className="p-6">{children}</div>
      </aside>
    </>
  )
}

function DoctorDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const currentUser = JSON.parse(localStorage.getItem('clinic_user') || 'null')
  const doctorId = firstValue(
    currentUser?.id,
    currentUser?._id,
    currentUser?.doctor_id,
    currentUser?.doctorId,
    '',
  )
  const doctorEmail = firstValue(currentUser?.email, 'doctor@clinic.com')

  const [activeSection, setActiveSection] = useState('today')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [intakeSearch, setIntakeSearch] = useState('')
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('')
  const [intakePanelAppointment, setIntakePanelAppointment] = useState(null)
  const [scheduleFilter, setScheduleFilter] = useState('upcoming')
  const [historySearch, setHistorySearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [historyNotes, setHistoryNotes] = useState({})
  const [clinicalNotes, setClinicalNotes] = useState('')
  const [availabilityForm, setAvailabilityForm] = useState({
    working_days: [],
    start_time: '',
    end_time: '',
    slot_duration_mins: 15,
    is_active: true,
  })

  const todayAppointmentsQuery = useQuery({
    queryKey: ['doctor', 'appointments', 'today', doctorId, today],
    queryFn: async () => {
      const response = await api.get('/api/appointments', {
        params: { date: today, doctor_id: doctorId },
      })
      return getAppointments(response.data)
    },
    enabled: Boolean(doctorId),
  })

  const doctorAppointmentsQuery = useQuery({
    queryKey: ['doctor', 'appointments', doctorId],
    queryFn: async () => {
      const response = await api.get('/api/appointments', {
        params: { doctor_id: doctorId },
      })
      return getAppointments(response.data)
    },
    enabled: Boolean(doctorId),
  })

  const weeklyScheduleQuery = useQuery({
    queryKey: ['doctor', 'schedule', doctorId],
    queryFn: async () => {
      const response = await api.get(`/api/appointments/doctor/${doctorId}`)
      return getAppointments(response.data)
    },
    enabled: Boolean(doctorId),
  })

  const patientsQuery = useQuery({
    queryKey: ['doctor', 'patients', historySearch],
    queryFn: async () => {
      const response = await api.get('/api/patients', {
        params: { search: historySearch || undefined },
      })
      return getPatients(response.data)
    },
    enabled: activeSection === 'history',
  })

  const doctorProfileQuery = useQuery({
    queryKey: ['doctor', 'profile', doctorId, doctorEmail],
    queryFn: async () => {
      const response = await api.get('/api/doctors')
      const doctors = getDoctors(response.data)

      return (
        doctors.find((doctor) => String(doctor.id) === String(doctorId)) ||
        doctors.find((doctor) => doctor.email?.toLowerCase() === doctorEmail.toLowerCase()) ||
        null
      )
    },
    enabled: Boolean(doctorId || doctorEmail),
  })

  const patientHistoryQuery = useQuery({
    queryKey: ['doctor', 'patient-history', selectedPatient?.id],
    queryFn: async () => {
      const response = await api.get(`/api/appointments/patient/${selectedPatient.id}`)
      return getAppointments(response.data)
    },
    enabled: Boolean(selectedPatient?.id),
  })

  const intakeAppointmentId = selectedAppointmentId || intakePanelAppointment?.id || ''

  const intakeQuery = useQuery({
    queryKey: ['doctor', 'intake-form', intakeAppointmentId],
    queryFn: async () => {
      const response = await api.get(`/api/intake-forms/${intakeAppointmentId}`)
      return normalizeIntake(response.data?.data || response.data)
    },
    enabled: Boolean(intakeAppointmentId),
    retry: false,
  })

  const invalidateAppointments = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['doctor', 'appointments'] }),
      queryClient.invalidateQueries({ queryKey: ['doctor', 'schedule'] }),
      queryClient.invalidateQueries({ queryKey: ['doctor', 'patient-history'] }),
    ])

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      await api.patch(`/api/appointments/${id}/status`, { status })
    },
    onSuccess: invalidateAppointments,
  })

  const notesMutation = useMutation({
    mutationFn: async ({ id, notes }) => {
      await api.patch(`/api/appointments/${id}`, { notes })
    },
    onSuccess: invalidateAppointments,
  })

  const availabilityMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      await api.patch(`/api/doctors/${id}`, payload)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['doctor', 'profile'] }),
        queryClient.invalidateQueries({ queryKey: ['doctor', 'appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['doctor', 'schedule'] }),
      ])
    },
  })

  const allDoctorAppointments = doctorAppointmentsQuery.data || EMPTY_ARRAY
  const todayAppointments = todayAppointmentsQuery.data || EMPTY_ARRAY
  const scheduleAppointments = weeklyScheduleQuery.data || EMPTY_ARRAY
  const searchedPatients = patientsQuery.data || EMPTY_ARRAY
  const patientHistory = patientHistoryQuery.data || EMPTY_ARRAY
  const doctorProfile = doctorProfileQuery.data || null

  const intakeCandidates = useMemo(() => {
    const needle = intakeSearch.trim().toLowerCase()

    return allDoctorAppointments.filter((appointment) => {
      if (!needle) return true

      return (
        String(appointment.id).toLowerCase().includes(needle) ||
        appointment.patient_name.toLowerCase().includes(needle)
      )
    })
  }, [allDoctorAppointments, intakeSearch])

  const weeklyGroups = useMemo(() => {
    const now = new Date()
    const filtered = scheduleAppointments.filter((appointment) => {
      if (scheduleFilter === 'all') return true

      const appointmentDate = new Date(appointment.date_time)
      return !Number.isNaN(appointmentDate.getTime()) && appointmentDate >= now
    })

    return filtered.reduce((groups, appointment) => {
      const key = formatDate(appointment.date_time)
      if (!groups[key]) groups[key] = []
      groups[key].push(appointment)
      return groups
    }, {})
  }, [scheduleAppointments, scheduleFilter])

  const pageTitle = NAV_ITEMS.find((item) => item.key === activeSection)?.label || 'Doctor'

  const resetAvailabilityForm = (profile = doctorProfile) => {
    setAvailabilityForm({
      working_days: profile?.working_days || [],
      start_time: profile?.start_time || '',
      end_time: profile?.end_time || '',
      slot_duration_mins: profile?.slot_duration_mins || 15,
      is_active: profile?.is_active ?? true,
    })
  }

  const handleSectionChange = (sectionKey) => {
    if (sectionKey === 'settings') {
      resetAvailabilityForm()
    }

    setActiveSection(sectionKey)
    setSidebarOpen(false)
  }

  const handleLogout = () => {
    localStorage.clear()
    navigate('/login', { replace: true })
  }

  const renderToday = () => (
    <SectionShell
      description="A live view of today’s consultations and quick actions."
      title="Today's Schedule"
    >
      {todayAppointmentsQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : todayAppointmentsQuery.isError ? (
        <ErrorBanner
          message={getErrorMessage(todayAppointmentsQuery.error, 'Failed to load today schedule.')}
        />
      ) : todayAppointments.length === 0 ? (
        <EmptyState message="No appointments scheduled for today." />
      ) : (
        <div className="space-y-4">
          {todayAppointments.map((appointment) => (
            <article key={appointment.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{appointment.patient_name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatTime(appointment.date_time)} · {appointment.duration} mins
                  </p>
                </div>
                <StatusBadge status={appointment.status} />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-700"
                  onClick={() => setIntakePanelAppointment(appointment)}
                  type="button"
                >
                  View Intake
                </button>
                <button
                  className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  onClick={() => statusMutation.mutate({ id: appointment.id, status: 'completed' })}
                  type="button"
                >
                  Mark Complete
                </button>
                <button
                  className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
                  onClick={() => statusMutation.mutate({ id: appointment.id, status: 'no_show' })}
                  type="button"
                >
                  No Show
                </button>
                <button
                  className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                  onClick={() => statusMutation.mutate({ id: appointment.id, status: 'pending' })}
                  type="button"
                >
                  Needs Follow-up
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-4">
        <ErrorBanner
          message={
            statusMutation.isError
              ? getErrorMessage(statusMutation.error, 'Unable to update appointment status.')
              : ''
          }
        />
      </div>
    </SectionShell>
  )

  const renderIntake = () => (
    <SectionShell
      description="Search appointments, review submitted intake details, and add clinical notes."
      title="Patient Intake"
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <Field label="Search by appointment ID or patient name">
            <input
              className={inputClasses}
              onChange={(event) => setIntakeSearch(event.target.value)}
              placeholder="Search appointments"
              type="text"
              value={intakeSearch}
            />
          </Field>
          <Field label="Select appointment">
            <select
              className={inputClasses}
              onChange={(event) => {
                setSelectedAppointmentId(event.target.value)
                setClinicalNotes('')
              }}
              value={selectedAppointmentId}
            >
              <option value="">Choose an appointment</option>
              {intakeCandidates.map((appointment) => (
                <option key={appointment.id} value={appointment.id}>
                  #{appointment.id} · {appointment.patient_name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {doctorAppointmentsQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : doctorAppointmentsQuery.isError ? (
          <ErrorBanner
            message={getErrorMessage(doctorAppointmentsQuery.error, 'Failed to load appointments.')}
          />
        ) : !selectedAppointmentId ? (
          <EmptyState message="Select an appointment to view its intake form." />
        ) : intakeQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : intakeQuery.isError ? (
          <ErrorBanner message={getErrorMessage(intakeQuery.error, 'Failed to load intake form.')} />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className={`${cardClasses} p-5`}>
                <p className="text-sm font-semibold text-slate-900">Symptoms</p>
                <p className="mt-2 text-sm text-slate-600">{intakeQuery.data?.symptoms}</p>
              </div>
              <div className={`${cardClasses} p-5`}>
                <p className="text-sm font-semibold text-slate-900">Current Medications</p>
                <p className="mt-2 text-sm text-slate-600">{intakeQuery.data?.current_medications}</p>
              </div>
              <div className={`${cardClasses} p-5`}>
                <p className="text-sm font-semibold text-slate-900">Allergies</p>
                <p className="mt-2 text-sm text-slate-600">{intakeQuery.data?.allergies}</p>
              </div>
              <div className={`${cardClasses} p-5`}>
                <p className="text-sm font-semibold text-slate-900">Insurance Info</p>
                <p className="mt-2 text-sm text-slate-600">{intakeQuery.data?.insurance_info}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
                AI Summary
              </p>
              <p className="mt-3 text-sm leading-6 text-cyan-900">{intakeQuery.data?.ai_summary}</p>
            </div>

            <form
              className={`${cardClasses} p-5`}
              onSubmit={(event) => {
                event.preventDefault()
                notesMutation.mutate({ id: selectedAppointmentId, notes: clinicalNotes })
              }}
            >
              <Field label="Add Clinical Notes">
                <textarea
                  className={inputClasses}
                  onChange={(event) => setClinicalNotes(event.target.value)}
                  rows="5"
                  value={clinicalNotes}
                />
              </Field>
              <div className="mt-4 flex justify-end">
                <button
                  className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={notesMutation.isPending || !selectedAppointmentId}
                  type="submit"
                >
                  {notesMutation.isPending ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </form>
          </div>
        )}

        <ErrorBanner
          message={
            notesMutation.isError
              ? getErrorMessage(notesMutation.error, 'Unable to save clinical notes.')
              : ''
          }
        />
      </div>
    </SectionShell>
  )

  const renderSchedule = () => (
    <SectionShell
      action={
        <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          {['upcoming', 'all'].map((value) => (
            <button
              key={value}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                scheduleFilter === value
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setScheduleFilter(value)}
              type="button"
            >
              {value === 'upcoming' ? 'Upcoming Only' : 'All'}
            </button>
          ))}
        </div>
      }
      description="Your weekly appointments grouped by day."
      title="My Schedule"
    >
      {weeklyScheduleQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : weeklyScheduleQuery.isError ? (
        <ErrorBanner
          message={getErrorMessage(weeklyScheduleQuery.error, 'Failed to load doctor schedule.')}
        />
      ) : Object.keys(weeklyGroups).length === 0 ? (
        <EmptyState message="No appointments found for this schedule view." />
      ) : (
        <div className="space-y-6">
          {Object.entries(weeklyGroups).map(([date, items]) => (
            <div key={date} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900">{date}</h3>
                <span className="text-sm text-slate-500">{items.length} appointments</span>
              </div>
              <div className="mt-4 space-y-3">
                {items.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{appointment.patient_name}</p>
                      <p className="mt-1 text-sm text-slate-500">{formatDateTime(appointment.date_time)}</p>
                    </div>
                    <StatusBadge status={appointment.status} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  )

  const renderHistory = () => (
    <SectionShell
      description="Search patients and review complete visit timelines."
      title="Patient History"
    >
      <div className="space-y-6">
        <Field label="Search patient">
          <input
            className={inputClasses}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="Search by patient name or phone"
            type="text"
            value={historySearch}
          />
        </Field>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className={`${cardClasses} p-5`}>
            <h3 className="text-base font-semibold text-slate-900">Patients</h3>
            <div className="mt-4">
              {patientsQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : patientsQuery.isError ? (
                <ErrorBanner
                  message={getErrorMessage(patientsQuery.error, 'Failed to load patients.')}
                />
              ) : searchedPatients.length === 0 ? (
                <EmptyState message="No matching patients found." />
              ) : (
                <div className="space-y-3">
                  {searchedPatients.map((patient) => (
                    <button
                      key={patient.id}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        selectedPatient?.id === patient.id
                          ? 'border-cyan-200 bg-cyan-50'
                          : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-slate-50'
                      }`}
                      onClick={() => setSelectedPatient(patient)}
                      type="button"
                    >
                      <p className="font-medium text-slate-900">{patient.full_name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {patient.phone || patient.email || 'No contact details'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={`${cardClasses} p-5`}>
            <h3 className="text-base font-semibold text-slate-900">
              {selectedPatient ? `${selectedPatient.full_name} Timeline` : 'Visit Timeline'}
            </h3>
            <div className="mt-4">
              {!selectedPatient ? (
                <EmptyState message="Select a patient to review visit history." />
              ) : patientHistoryQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : patientHistoryQuery.isError ? (
                <ErrorBanner
                  message={getErrorMessage(
                    patientHistoryQuery.error,
                    'Failed to load patient history.',
                  )}
                />
              ) : patientHistory.length === 0 ? (
                <EmptyState message="No visit history found for this patient." />
              ) : (
                <div className="space-y-4">
                  {patientHistory.map((appointment) => (
                    <div key={appointment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{formatDateTime(appointment.date_time)}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            Notes: {appointment.notes || 'No notes added yet'}
                          </p>
                        </div>
                        <StatusBadge status={appointment.status} />
                      </div>

                      <div className="mt-4">
                        <textarea
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                          onChange={(event) =>
                            setHistoryNotes((current) => ({
                              ...current,
                              [appointment.id]: event.target.value,
                            }))
                          }
                          placeholder="Add follow-up notes"
                          rows="3"
                          value={historyNotes[appointment.id] || ''}
                        />
                        <div className="mt-3 flex justify-end">
                          <button
                            className="rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-700"
                            onClick={() =>
                              notesMutation.mutate({
                                id: appointment.id,
                                notes: historyNotes[appointment.id] || '',
                              })
                            }
                            type="button"
                          >
                            Save Follow-up
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <ErrorBanner
          message={
            notesMutation.isError
              ? getErrorMessage(notesMutation.error, 'Unable to save follow-up notes.')
              : ''
          }
        />
      </div>
    </SectionShell>
  )

  const renderSettings = () => (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className={`${cardClasses} p-6`}>
        <h3 className="text-lg font-semibold text-slate-900">Account</h3>
        <p className="mt-4 text-sm text-slate-500">Logged in as</p>
        <p className="mt-1 text-base font-medium text-slate-900">{doctorEmail}</p>
        <p className="mt-4 text-sm text-slate-500">Role</p>
        <p className="mt-1 text-base font-medium text-slate-900">Doctor</p>
        <p className="mt-4 text-sm text-slate-500">Availability status</p>
        <div className="mt-2">
          <StatusBadge status={doctorProfile?.is_active ? 'active' : 'inactive'} />
        </div>
        <p className="mt-4 text-sm text-slate-500">Working days</p>
        <p className="mt-1 text-base font-medium text-slate-900">
          {doctorProfile?.working_days?.join(', ') || 'Not set'}
        </p>
        <p className="mt-4 text-sm text-slate-500">Hours</p>
        <p className="mt-1 text-base font-medium text-slate-900">
          {doctorProfile?.start_time || 'N/A'} to {doctorProfile?.end_time || 'N/A'}
        </p>
        <p className="mt-4 text-sm text-slate-500">Slot duration</p>
        <p className="mt-1 text-base font-medium text-slate-900">
          {doctorProfile?.slot_duration_mins || 15} mins
        </p>
      </div>

      <div className={`${cardClasses} p-6`}>
        <h3 className="text-lg font-semibold text-slate-900">Availability & Slots</h3>
        <p className="mt-2 text-sm text-slate-600">
          Update your available days, clinic hours, and appointment slot duration.
        </p>

        {doctorProfileQuery.isLoading ? (
          <p className="mt-6 text-sm text-slate-500">Loading...</p>
        ) : doctorProfileQuery.isError ? (
          <div className="mt-6">
            <ErrorBanner
              message={getErrorMessage(doctorProfileQuery.error, 'Failed to load doctor profile.')}
            />
          </div>
        ) : !doctorProfile ? (
          <div className="mt-6">
            <EmptyState message="Doctor profile not found for availability settings." />
          </div>
        ) : (
          <form
            className="mt-6 space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              availabilityMutation.mutate({
                id: doctorProfile.id,
                payload: {
                  working_days: availabilityForm.working_days,
                  start_time: availabilityForm.start_time,
                  end_time: availabilityForm.end_time,
                  slot_duration_mins: Number(availabilityForm.slot_duration_mins),
                  is_active: availabilityForm.is_active,
                },
              })
            }}
          >
            <div>
              <p className="text-sm font-medium text-slate-700">Working days</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const checked = availabilityForm.working_days.includes(day)

                  return (
                    <label
                      key={day}
                      className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
                        checked
                          ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <input
                        checked={checked}
                        className="accent-cyan-600"
                        onChange={(event) =>
                          setAvailabilityForm((current) => ({
                            ...current,
                            working_days: event.target.checked
                              ? [...current.working_days, day]
                              : current.working_days.filter((item) => item !== day),
                          }))
                        }
                        type="checkbox"
                      />
                      {day}
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Start time">
                <input
                  className={inputClasses}
                  onChange={(event) =>
                    setAvailabilityForm((current) => ({
                      ...current,
                      start_time: event.target.value,
                    }))
                  }
                  type="time"
                  value={availabilityForm.start_time}
                />
              </Field>
              <Field label="End time">
                <input
                  className={inputClasses}
                  onChange={(event) =>
                    setAvailabilityForm((current) => ({
                      ...current,
                      end_time: event.target.value,
                    }))
                  }
                  type="time"
                  value={availabilityForm.end_time}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Slot duration (mins)">
                <input
                  className={inputClasses}
                  min="5"
                  onChange={(event) =>
                    setAvailabilityForm((current) => ({
                      ...current,
                      slot_duration_mins: event.target.value,
                    }))
                  }
                  type="number"
                  value={availabilityForm.slot_duration_mins}
                />
              </Field>
              <Field label="Availability status">
                <select
                  className={inputClasses}
                  onChange={(event) =>
                    setAvailabilityForm((current) => ({
                      ...current,
                      is_active: event.target.value === 'active',
                    }))
                  }
                  value={availabilityForm.is_active ? 'active' : 'inactive'}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            </div>

            <ErrorBanner
              message={
                availabilityMutation.isError
                  ? getErrorMessage(
                      availabilityMutation.error,
                      'Unable to update availability.',
                    )
                  : ''
              }
            />

            <div className="flex flex-wrap justify-end gap-3">
              <button
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => resetAvailabilityForm()}
                type="button"
              >
                Reset
              </button>
              <button
                className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={availabilityMutation.isPending}
                type="submit"
              >
                {availabilityMutation.isPending ? 'Saving...' : 'Save Availability'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className={`${cardClasses} p-6 xl:col-span-2`}>
        <h3 className="text-lg font-semibold text-slate-900">Session</h3>
        <p className="mt-4 text-sm text-slate-600">
          Use logout when you are done to keep patient information secure.
        </p>
        <button
          className="mt-6 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
          onClick={handleLogout}
          type="button"
        >
          Logout
        </button>
      </div>
    </div>
  )

  const sectionContent = {
    today: renderToday(),
    intake: renderIntake(),
    schedule: renderSchedule(),
    history: renderHistory(),
    settings: renderSettings(),
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div
        className={`fixed inset-0 z-30 bg-slate-950/50 transition lg:hidden ${sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setSidebarOpen(false)}
        role="presentation"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-slate-900 text-slate-100 transition duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-800 px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">
              Clinic CRM
            </p>
            <p className="mt-2 text-sm text-slate-400">Doctor workspace</p>
          </div>
          <nav className="flex-1 space-y-2 px-4 py-6">
            {NAV_ITEMS.map((item) => {
              const isActive = item.key === activeSection

              return (
                <button
                  key={item.key}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-400/40'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  onClick={() => handleSectionChange(item.key)}
                  type="button"
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-700 lg:hidden"
                onClick={() => setSidebarOpen(true)}
                type="button"
              >
                ☰
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-600">
                  Doctor
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-900">{pageTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 sm:block">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Signed in</p>
                <p className="text-sm font-medium text-slate-800">{doctorEmail}</p>
              </div>
              <button
                className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
                onClick={handleLogout}
                type="button"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{sectionContent[activeSection]}</main>
      </div>

      <SlidingPanel
        onClose={() => setIntakePanelAppointment(null)}
        open={Boolean(intakePanelAppointment)}
        title={intakePanelAppointment ? `Intake · ${intakePanelAppointment.patient_name}` : 'Intake'}
      >
        {!intakePanelAppointment ? null : intakeQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : intakeQuery.isError ? (
          <ErrorBanner message={getErrorMessage(intakeQuery.error, 'Failed to load intake form.')} />
        ) : (
          <div className="space-y-5">
            <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
                AI Summary
              </p>
              <p className="mt-3 text-sm leading-6 text-cyan-900">{intakeQuery.data?.ai_summary}</p>
            </div>
            <div className={`${cardClasses} p-5`}>
              <p className="text-sm font-semibold text-slate-900">Symptoms</p>
              <p className="mt-2 text-sm text-slate-600">{intakeQuery.data?.symptoms}</p>
            </div>
            <div className={`${cardClasses} p-5`}>
              <p className="text-sm font-semibold text-slate-900">Current Medications</p>
              <p className="mt-2 text-sm text-slate-600">{intakeQuery.data?.current_medications}</p>
            </div>
            <div className={`${cardClasses} p-5`}>
              <p className="text-sm font-semibold text-slate-900">Allergies</p>
              <p className="mt-2 text-sm text-slate-600">{intakeQuery.data?.allergies}</p>
            </div>
            <div className={`${cardClasses} p-5`}>
              <p className="text-sm font-semibold text-slate-900">Insurance Info</p>
              <p className="mt-2 text-sm text-slate-600">{intakeQuery.data?.insurance_info}</p>
            </div>
          </div>
        )}
      </SlidingPanel>
    </div>
  )
}

export default DoctorDashboard
