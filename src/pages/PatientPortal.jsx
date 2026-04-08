
import { useMemo, useState } from 'react'
import axios from 'axios'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiBaseUrl, apiConfigError, getApiErrorMessage } from '../lib/config.js'

const TABS = [
  { key: 'appointments', icon: 'calendar', label: 'Appointments' },
  { key: 'intake', icon: 'document', label: 'Intake' },
  { key: 'history', icon: 'history', label: 'History' },
  { key: 'feedback', icon: 'star', label: 'Feedback' },
]

const TAB_DETAILS = {
  appointments: {
    title: 'My Appointments',
    subtitle: 'Manage upcoming visits and cancellation requests.',
  },
  intake: {
    title: 'Pre-Visit Intake',
    subtitle: 'Share your medical details before consultation.',
  },
  history: {
    title: 'Visit History',
    subtitle: 'Review completed appointments and notes.',
  },
  feedback: {
    title: 'Patient Feedback',
    subtitle: 'Rate your completed consultations.',
  },
}

const STATUS_STYLES = {
  confirmed: 'bg-sky-100 text-sky-700 ring-sky-200',
  pending: 'bg-amber-100 text-amber-800 ring-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-rose-100 text-rose-700 ring-rose-200',
}

const EMPTY_ARRAY = []

const firstValue = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '')

const safeJsonParse = (value) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const normalizeToken = (rawToken) => {
  if (!rawToken) return ''

  let token = String(rawToken).trim()
  if (token.toLowerCase().startsWith('bearer ')) {
    token = token.slice(7).trim()
  }
  return token.replace(/^['"]|['"]$/g, '').trim()
}

const ensureArray = (value, keys = []) => {
  if (Array.isArray(value)) return value

  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }

  return []
}

const normalizeAppointment = (appointment = {}) => ({
  id: firstValue(appointment.id, appointment._id, appointment.appointment_id, ''),
  doctor_name: firstValue(
    appointment.doctor_name,
    appointment.doctorName,
    appointment.doctor?.full_name,
    appointment.doctor?.name,
    'Doctor',
  ),
  patient_id: firstValue(
    appointment.patient_id,
    appointment.patient?.id,
    appointment.patient?._id,
    '',
  ),
  status: firstValue(appointment.status, 'pending'),
  scheduled_at: firstValue(
    appointment.scheduled_at,
    appointment.date_time,
    appointment.datetime,
    appointment.date,
    '',
  ),
  duration: Number(
    firstValue(appointment.duration, appointment.slot_duration_mins, appointment.slotDurationMins, 0),
  ),
  notes: firstValue(appointment.notes, appointment.doctor_notes, ''),
  intake_form: firstValue(appointment.intake_form, appointment.intakeForm, null),
  intake_submitted: Boolean(
    firstValue(
      appointment.intake_submitted,
      appointment.intakeSubmitted,
      appointment.has_intake_form,
      appointment.hasIntakeForm,
      false,
    ),
  ),
  feedback: firstValue(appointment.feedback, appointment.feedback_data, null),
  feedback_submitted: Boolean(
    firstValue(
      appointment.feedback_submitted,
      appointment.feedbackSubmitted,
      appointment.has_feedback,
      appointment.hasFeedback,
      false,
    ),
  ),
})

const getAppointments = (payload) =>
  ensureArray(payload, ['appointments', 'data']).map(normalizeAppointment)

const getErrorMessage = (error, fallback = 'Something went wrong.') =>
  getApiErrorMessage(error, fallback)

const formatDate = (value) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date)
}

const formatTime = (value) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const parseAllergies = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const normalizeFeedback = (feedback) => {
  if (!feedback || typeof feedback !== 'object') return null
  return {
    rating: Number(firstValue(feedback.rating, 0)),
    comment: firstValue(feedback.comment, ''),
  }
}

const markUpcomingAppointments = (appointments) => {
  const now = Date.now()
  return appointments.map((item) => {
    const scheduled = new Date(item.scheduled_at)
    return {
      ...item,
      is_upcoming: !Number.isNaN(scheduled.getTime()) && scheduled.getTime() > now,
    }
  })
}

const hasIntake = (appointment) =>
  Boolean(
    appointment?.intake_submitted ||
      appointment?.intake_form ||
      appointment?.intake_form_id ||
      appointment?.intake_form?.id,
  )

const hasFeedback = (appointment) =>
  Boolean(
    appointment?.feedback_submitted ||
      appointment?.feedback ||
      appointment?.feedback_id ||
      appointment?.feedback?.id,
  )

const canCancelAppointment = (scheduledAt) => {
  const target = new Date(scheduledAt)
  if (Number.isNaN(target.getTime())) return false
  return target.getTime() - Date.now() > 24 * 60 * 60 * 1000
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-14">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-600" />
    </div>
  )
}

function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm font-medium text-rose-700">
      {message}
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
      {message}
    </div>
  )
}

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

function Stars({ value, onChange, readOnly = false }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, index) => {
        const starValue = index + 1
        const active = starValue <= value
        if (readOnly) {
          return (
            <span key={starValue} className={`text-xl ${active ? 'text-amber-500' : 'text-slate-300'}`}>
              {'\u2605'}
            </span>
          )
        }

        return (
          <button
            key={starValue}
            className={`min-h-[44px] min-w-[44px] rounded-xl text-2xl transition ${
              active ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
            }`}
            onClick={() => onChange(starValue)}
            type="button"
          >
            {'\u2605'}
          </button>
        )
      })}
    </div>
  )
}

function TabIcon({ type, active }) {
  const tone = active ? 'text-cyan-700' : 'text-slate-500'

  if (type === 'calendar') {
    return (
      <svg className={`h-5 w-5 ${tone}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="17" rx="2.5" />
        <path d="M8 2v4M16 2v4M3 9h18" />
      </svg>
    )
  }

  if (type === 'document') {
    return (
      <svg className={`h-5 w-5 ${tone}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M14 3v6h6M9 13h6M9 17h6" />
      </svg>
    )
  }

  if (type === 'history') {
    return (
      <svg className={`h-5 w-5 ${tone}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5M12 7v6l4 2" />
      </svg>
    )
  }

  return (
    <svg className={`h-5 w-5 ${tone}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.5L12 16.5 7 19.1l1-5.5-4-3.9 5.6-.8Z" />
    </svg>
  )
}

function PatientPortal() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('appointments')
  const [selectedFeedbackAppointmentId, setSelectedFeedbackAppointmentId] = useState('')
  const [intakeSuccess, setIntakeSuccess] = useState('')
  const [feedbackSuccess, setFeedbackSuccess] = useState({})
  const [intakeForms, setIntakeForms] = useState({})
  const [feedbackDrafts, setFeedbackDrafts] = useState({})

  const token = normalizeToken(localStorage.getItem('clinic_token'))
  const user = safeJsonParse(localStorage.getItem('clinic_user'))
  const patientId = firstValue(user?.id, user?._id, user?.patient_id, user?.patientId, '')
  const patientEmail = firstValue(user?.email, 'patient@clinic.com')

  const api = useMemo(
    () =>
      axios.create({
        baseURL: apiBaseUrl,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    [token],
  )

  const appointmentsQuery = useQuery({
    queryKey: ['patient', 'appointments', patientId],
    queryFn: async () => {
      if (apiConfigError) {
        throw new Error(apiConfigError)
      }

      const response = await api.get(`/api/appointments/patient/${patientId}`)
      return markUpcomingAppointments(getAppointments(response.data))
    },
    enabled: Boolean(patientId && token),
  })

  const allAppointments = appointmentsQuery.data || EMPTY_ARRAY

  const upcomingAppointments = useMemo(
    () =>
      allAppointments
        .filter((item) => item.is_upcoming && String(item.status).toLowerCase() !== 'cancelled')
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [allAppointments],
  )

  const completedAppointments = useMemo(
    () =>
      allAppointments
        .filter((item) => String(item.status).toLowerCase() === 'completed')
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
    [allAppointments],
  )

  const pendingIntakeAppointment = useMemo(
    () => upcomingAppointments.find((item) => !hasIntake(item)) || null,
    [upcomingAppointments],
  )

  const submittedIntakeAppointment = useMemo(
    () => (!pendingIntakeAppointment ? upcomingAppointments.find((item) => hasIntake(item)) || null : null),
    [pendingIntakeAppointment, upcomingAppointments],
  )

  const submittedIntakeQuery = useQuery({
    queryKey: ['patient', 'intake-form', submittedIntakeAppointment?.id],
    queryFn: async () => {
      const response = await api.get(`/api/intake-forms/${submittedIntakeAppointment.id}`)
      return response.data?.data || response.data
    },
    enabled: Boolean(submittedIntakeAppointment?.id),
    retry: false,
  })

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId) => {
      await api.patch(`/api/appointments/${appointmentId}/status`, {
        status: 'cancelled',
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient', 'appointments'] })
    },
  })

  const intakeMutation = useMutation({
    mutationFn: async (payload) => {
      await api.post('/api/intake-forms', payload)
    },
    onSuccess: async () => {
      setIntakeSuccess('Form submitted! Your doctor will review before your appointment.')
      await queryClient.invalidateQueries({ queryKey: ['patient', 'appointments'] })
      await queryClient.invalidateQueries({ queryKey: ['patient', 'intake-form'] })
    },
  })

  const feedbackMutation = useMutation({
    mutationFn: async ({ appointmentId, payload }) => {
      await api.post('/api/feedback', payload)
      return appointmentId
    },
    onSuccess: async (appointmentId) => {
      setFeedbackSuccess((current) => ({ ...current, [appointmentId]: true }))
      await queryClient.invalidateQueries({ queryKey: ['patient', 'appointments'] })
    },
  })

  const pendingFeedbackAppointments = useMemo(
    () => completedAppointments.filter((item) => !hasFeedback(item)),
    [completedAppointments],
  )

  const submittedFeedbackAppointments = useMemo(
    () => completedAppointments.filter((item) => hasFeedback(item)),
    [completedAppointments],
  )

  const sortedPendingFeedbackAppointments = useMemo(() => {
    if (!selectedFeedbackAppointmentId) return pendingFeedbackAppointments
    return [...pendingFeedbackAppointments].sort((a, b) => {
      if (String(a.id) === String(selectedFeedbackAppointmentId)) return -1
      if (String(b.id) === String(selectedFeedbackAppointmentId)) return 1
      return new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
    })
  }, [pendingFeedbackAppointments, selectedFeedbackAppointmentId])

  const handleLogout = () => {
    localStorage.clear()
    navigate('/login', { replace: true })
  }

  const handleCancelAppointment = (appointment) => {
    if (!canCancelAppointment(appointment.scheduled_at)) return

    const confirmed = window.confirm('Are you sure you want to cancel this appointment?')
    if (!confirmed) return

    cancelMutation.mutate(appointment.id)
  }

  const intakeReadOnlyData =
    submittedIntakeQuery.data ||
    submittedIntakeAppointment?.intake_form ||
    submittedIntakeAppointment?.intakeForm ||
    null
  const intakeDraft = pendingIntakeAppointment
    ? intakeForms[pendingIntakeAppointment.id] || {
        symptoms: '',
        current_medications: '',
        allergies: '',
        insurance_info: '',
      }
    : null

  const renderAppointmentsTab = () => {
    if (appointmentsQuery.isLoading) return <Spinner />
    if (appointmentsQuery.isError) {
      return (
        <ErrorBanner
          message={getErrorMessage(appointmentsQuery.error, 'Failed to load appointments.')}
        />
      )
    }

    if (!upcomingAppointments.length) {
      return <EmptyState message="No upcoming appointments. Contact the clinic to book." />
    }

    return (
      <div className="space-y-4">
        {upcomingAppointments.map((appointment) => {
          const canCancel = canCancelAppointment(appointment.scheduled_at)
          return (
            <article
              key={appointment.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_6px_24px_rgba(15,23,42,0.06)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Doctor</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{appointment.doctor_name}</h3>
                </div>
                <StatusBadge status={appointment.status} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 text-sm text-slate-700">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-cyan-700">Date</p>
                  <p className="mt-1 font-semibold">{formatDate(appointment.scheduled_at)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-cyan-700">Time</p>
                  <p className="mt-1 font-semibold">{formatTime(appointment.scheduled_at)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-cyan-700">Duration</p>
                  <p className="mt-1 font-semibold">
                    {appointment.duration > 0 ? `${appointment.duration} mins` : 'Not provided'}
                  </p>
                </div>
              </div>

              {canCancel ? (
                <button
                  className="mt-4 min-h-[44px] w-full rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={cancelMutation.isPending}
                  onClick={() => handleCancelAppointment(appointment)}
                  type="button"
                >
                  {cancelMutation.isPending ? 'Cancelling...' : 'Cancel'}
                </button>
              ) : (
                <p className="mt-4 text-xs text-slate-500">
                  Cancellations are available only more than 24 hours before the appointment.
                </p>
              )}
            </article>
          )
        })}

        <ErrorBanner
          message={
            cancelMutation.isError
              ? getErrorMessage(cancelMutation.error, 'Unable to cancel appointment.')
              : ''
          }
        />
      </div>
    )
  }

  const renderIntakeTab = () => {
    if (appointmentsQuery.isLoading) return <Spinner />
    if (appointmentsQuery.isError) {
      return (
        <ErrorBanner
          message={getErrorMessage(appointmentsQuery.error, 'Failed to load intake information.')}
        />
      )
    }

    if (!upcomingAppointments.length) {
      return <EmptyState message="No pending intake forms." />
    }

    if (pendingIntakeAppointment) {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-900">
            Intake form for {pendingIntakeAppointment.doctor_name} on{' '}
            {formatDate(pendingIntakeAppointment.scheduled_at)} at{' '}
            {formatTime(pendingIntakeAppointment.scheduled_at)}.
          </div>

          <form
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_6px_24px_rgba(15,23,42,0.06)]"
            onSubmit={(event) => {
              event.preventDefault()
              intakeMutation.mutate({
                appointment_id: pendingIntakeAppointment.id,
                patient_id: patientId || pendingIntakeAppointment.patient_id,
                symptoms: intakeDraft?.symptoms || '',
                current_medications: intakeDraft?.current_medications || '',
                allergies: parseAllergies(intakeDraft?.allergies || ''),
                insurance_info: intakeDraft?.insurance_info || '',
              })
            }}
          >
            <label className="block text-sm font-medium text-slate-700">
              Symptoms
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                onChange={(event) =>
                  setIntakeForms((current) => ({
                    ...current,
                    [pendingIntakeAppointment.id]: {
                      ...intakeDraft,
                      symptoms: event.target.value,
                    },
                  }))
                }
                required
                rows={4}
                value={intakeDraft?.symptoms || ''}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Current medications
              <textarea
                className="mt-2 min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                onChange={(event) =>
                  setIntakeForms((current) => ({
                    ...current,
                    [pendingIntakeAppointment.id]: {
                      ...intakeDraft,
                      current_medications: event.target.value,
                    },
                  }))
                }
                rows={4}
                value={intakeDraft?.current_medications || ''}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Allergies (comma separated)
              <input
                className="mt-2 min-h-[44px] w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                onChange={(event) =>
                  setIntakeForms((current) => ({
                    ...current,
                    [pendingIntakeAppointment.id]: {
                      ...intakeDraft,
                      allergies: event.target.value,
                    },
                  }))
                }
                type="text"
                value={intakeDraft?.allergies || ''}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Insurance info
              <input
                className="mt-2 min-h-[44px] w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                onChange={(event) =>
                  setIntakeForms((current) => ({
                    ...current,
                    [pendingIntakeAppointment.id]: {
                      ...intakeDraft,
                      insurance_info: event.target.value,
                    },
                  }))
                }
                type="text"
                value={intakeDraft?.insurance_info || ''}
              />
            </label>

            {intakeSuccess ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {intakeSuccess}
              </div>
            ) : null}

            <ErrorBanner
              message={
                intakeMutation.isError
                  ? getErrorMessage(intakeMutation.error, 'Unable to submit intake form.')
                  : ''
              }
            />

            <button
              className="min-h-[44px] w-full rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={intakeMutation.isPending}
              type="submit"
            >
              {intakeMutation.isPending ? 'Submitting...' : 'Submit Intake Form'}
            </button>
          </form>
        </div>
      )
    }

    if (!submittedIntakeAppointment) {
      return <EmptyState message="No pending intake forms." />
    }

    if (submittedIntakeQuery.isLoading) return <Spinner />
    if (submittedIntakeQuery.isError && !intakeReadOnlyData) {
      return (
        <ErrorBanner
          message={getErrorMessage(submittedIntakeQuery.error, 'Failed to load submitted intake form.')}
        />
      )
    }

    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_6px_24px_rgba(15,23,42,0.06)]">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Intake form already submitted for your upcoming appointment.
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Symptoms</p>
          <p className="mt-2 text-sm text-slate-700">
            {firstValue(intakeReadOnlyData?.symptoms, 'Not provided')}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Current Medications</p>
          <p className="mt-2 text-sm text-slate-700">
            {firstValue(intakeReadOnlyData?.current_medications, 'Not provided')}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Allergies</p>
          <p className="mt-2 text-sm text-slate-700">
            {Array.isArray(intakeReadOnlyData?.allergies)
              ? intakeReadOnlyData.allergies.join(', ') || 'None'
              : firstValue(intakeReadOnlyData?.allergies, 'None')}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Insurance Info</p>
          <p className="mt-2 text-sm text-slate-700">
            {firstValue(intakeReadOnlyData?.insurance_info, 'Not provided')}
          </p>
        </div>
      </div>
    )
  }

  const renderHistoryTab = () => {
    if (appointmentsQuery.isLoading) return <Spinner />
    if (appointmentsQuery.isError) {
      return (
        <ErrorBanner
          message={getErrorMessage(appointmentsQuery.error, 'Failed to load appointment history.')}
        />
      )
    }

    if (!completedAppointments.length) {
      return <EmptyState message="No completed appointments yet." />
    }

    return (
      <div className="space-y-4">
        {completedAppointments.map((appointment) => (
          <article
            key={appointment.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_6px_24px_rgba(15,23,42,0.06)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Doctor</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{appointment.doctor_name}</h3>
                <p className="mt-1 text-sm text-slate-500">{formatDate(appointment.scheduled_at)}</p>
              </div>
              <StatusBadge status={appointment.status} />
            </div>

            {appointment.notes ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Doctor Notes</p>
                <p className="mt-2 text-sm text-slate-700">{appointment.notes}</p>
              </div>
            ) : null}

            {!hasFeedback(appointment) ? (
              <button
                className="mt-4 min-h-[44px] w-full rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700"
                onClick={() => {
                  setSelectedFeedbackAppointmentId(String(appointment.id))
                  setActiveTab('feedback')
                }}
                type="button"
              >
                Leave Feedback
              </button>
            ) : null}
          </article>
        ))}
      </div>
    )
  }

  const renderFeedbackTab = () => {
    if (appointmentsQuery.isLoading) return <Spinner />
    if (appointmentsQuery.isError) {
      return (
        <ErrorBanner
          message={getErrorMessage(appointmentsQuery.error, 'Failed to load feedback details.')}
        />
      )
    }

    if (!completedAppointments.length) {
      return <EmptyState message="No completed appointments available for feedback yet." />
    }

    return (
      <div className="space-y-6">
        {!sortedPendingFeedbackAppointments.length ? (
          <EmptyState message="All set. You have already submitted feedback for completed appointments." />
        ) : (
          <div className="space-y-4">
            {sortedPendingFeedbackAppointments.map((appointment) => {
              const draft = feedbackDrafts[appointment.id] || { rating: 0, comment: '' }
              const isSubmitting =
                feedbackMutation.isPending &&
                String(feedbackMutation.variables?.appointmentId) === String(appointment.id)

              return (
                <article
                  key={appointment.id}
                  className={`rounded-2xl border bg-white p-5 shadow-[0_6px_24px_rgba(15,23,42,0.06)] ${
                    String(selectedFeedbackAppointmentId) === String(appointment.id)
                      ? 'border-cyan-300 ring-2 ring-cyan-100'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Feedback For</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{appointment.doctor_name}</h3>
                      <p className="mt-1 text-sm text-slate-500">{formatDate(appointment.scheduled_at)}</p>
                    </div>
                    <StatusBadge status={appointment.status} />
                  </div>

                  <div className="mt-4">
                    <p className="text-sm font-medium text-slate-700">Rating</p>
                    <Stars
                      onChange={(rating) =>
                        setFeedbackDrafts((current) => ({
                          ...current,
                          [appointment.id]: {
                            ...current[appointment.id],
                            rating,
                            comment: current[appointment.id]?.comment || '',
                          },
                        }))
                      }
                      value={draft.rating || 0}
                    />
                  </div>

                  <label className="mt-3 block text-sm font-medium text-slate-700">
                    Comment
                    <textarea
                      className="mt-2 min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                      onChange={(event) =>
                        setFeedbackDrafts((current) => ({
                          ...current,
                          [appointment.id]: {
                            ...current[appointment.id],
                            rating: current[appointment.id]?.rating || 0,
                            comment: event.target.value,
                          },
                        }))
                      }
                      rows={4}
                      value={draft.comment || ''}
                    />
                  </label>

                  {feedbackSuccess[appointment.id] ? (
                    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      Thank you for your feedback!
                    </div>
                  ) : null}

                  <button
                    className="mt-4 min-h-[44px] w-full rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={isSubmitting || (draft.rating || 0) < 1 || feedbackSuccess[appointment.id]}
                    onClick={() =>
                      feedbackMutation.mutate({
                        appointmentId: appointment.id,
                        payload: {
                          appointment_id: appointment.id,
                          patient_id: patientId || appointment.patient_id,
                          rating: draft.rating,
                          comment: draft.comment || '',
                        },
                      })
                    }
                    type="button"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                </article>
              )
            })}
          </div>
        )}

        <ErrorBanner
          message={
            feedbackMutation.isError
              ? getErrorMessage(feedbackMutation.error, 'Unable to submit feedback.')
              : ''
          }
        />

        {submittedFeedbackAppointments.length ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Submitted Feedback
            </h3>
            {submittedFeedbackAppointments.map((appointment) => {
              const feedback = normalizeFeedback(appointment.feedback)
              return (
                <article key={appointment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{appointment.doctor_name}</p>
                      <p className="text-sm text-slate-500">{formatDate(appointment.scheduled_at)}</p>
                    </div>
                    <StatusBadge status="completed" />
                  </div>
                  <div className="mt-3">
                    <Stars readOnly value={feedback?.rating || 0} />
                    <p className="mt-2 text-sm text-slate-700">
                      {firstValue(feedback?.comment, 'No comment provided.')}
                    </p>
                  </div>
                </article>
              )
            })}
          </section>
        ) : null}
      </div>
    )
  }

  const tabContent = {
    appointments: renderAppointmentsTab(),
    intake: renderIntakeTab(),
    history: renderHistoryTab(),
    feedback: renderFeedbackTab(),
  }
  const activeTabMeta = TAB_DETAILS[activeTab] || TAB_DETAILS.appointments
  const activeTabLabel = TABS.find((tab) => tab.key === activeTab)?.label || 'Appointments'

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-600 text-sm font-bold text-white">
              {patientEmail.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-700">Patient Portal</p>
              <h1 className="text-lg font-semibold text-slate-900">My Health Portal</h1>
              <p className="text-xs text-slate-500">{patientEmail}</p>
            </div>
          </div>
          <button
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={handleLogout}
            type="button"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-5 pb-28">
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_6px_24px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">{activeTabLabel}</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{activeTabMeta.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{activeTabMeta.subtitle}</p>
        </section>
        {!token || !patientId ? (
          <ErrorBanner message="Your session is missing patient details. Please login again." />
        ) : (
          tabContent[activeTab]
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-4 gap-1 px-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                className={`flex min-h-[56px] flex-col items-center justify-center rounded-xl px-1 text-[11px] font-semibold transition ${
                  isActive
                    ? 'border border-cyan-200 bg-cyan-50 text-cyan-700'
                    : 'border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                <TabIcon active={isActive} type={tab.icon} />
                <span className="mt-1 leading-tight">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default PatientPortal
