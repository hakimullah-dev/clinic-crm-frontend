// API calls handled via src/services/*
// which use shared api instance from src/lib/api.js
// 401 handling is covered by shared interceptor
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { clearStoredAuth, getStoredUser } from '../lib/auth.js'
import { getApiErrorMessage } from '../lib/config.js'
import {
  addDaysToDateKey,
  combineDateAndTime,
  formatDate,
  formatDateTime,
  formatTime,
  getSydneyToday,
  hoursUntil,
  isClinicDay,
  isDateTimeFuture,
  isFuture,
  isToday,
} from '../lib/datetime.js'
import { useForm } from '../lib/useForm.js'
import {
  isClinicDay as validateClinicDay,
  isFuture as validateFuture,
  required,
} from '../lib/validators.js'
import {
  cancelAppointment,
  createAppointment,
  getSlots,
} from '../services/appointments.js'
import { getDoctors } from '../services/doctors.js'
import {
  getIntakeForm,
  getPatientAppointments,
  submitFeedback,
  submitIntakeForm,
} from '../services/patientPortal.js'

const TABS = [
  { key: 'appointments', label: 'Appointments' },
  { key: 'booking', label: 'Book' },
  { key: 'intake', label: 'Intake' },
  { key: 'history', label: 'History' },
  { key: 'feedback', label: 'Feedback' },
]

const STATUS_STYLES = {
  confirmed: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  pending: 'bg-amber-100 text-amber-800 ring-amber-200',
  completed: 'bg-sky-100 text-sky-700 ring-sky-200',
  cancelled: 'bg-rose-100 text-rose-700 ring-rose-200',
}

const PANEL_CLASSES =
  'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.06)]'

const firstValue = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '')

const ensureArray = (value, keys = []) => {
  if (Array.isArray(value)) {
    return value
  }

  for (const key of keys) {
    if (Array.isArray(value?.[key])) {
      return value[key]
    }
  }

  return []
}

const normalizeAppointment = (appointment = {}) => ({
  id: firstValue(appointment.id, appointment._id, appointment.appointment_id, ''),
  doctor_id: firstValue(
    appointment.doctor_id,
    appointment.doctor?.id,
    appointment.doctor?._id,
    '',
  ),
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
  patient_name: firstValue(
    appointment.patient_name,
    appointment.patient?.full_name,
    appointment.patient?.name,
    'Patient',
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

const normalizeDoctor = (doctor = {}) => ({
  id: firstValue(doctor.id, doctor._id, doctor.doctor_id, doctor.user_id, ''),
  full_name: firstValue(doctor.full_name, doctor.name, 'Doctor'),
  specialty: firstValue(doctor.specialty, doctor.specialisation, 'General Practice'),
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
})

const normalizeSlots = (slotsPayload) =>
  ensureArray(slotsPayload, ['slots', 'data']).map((slot) =>
    typeof slot === 'string' ? slot : firstValue(slot.value, slot.time, slot.start_time, ''),
  )

const normalizeFeedback = (feedback) => {
  if (!feedback || typeof feedback !== 'object') {
    return null
  }

  return {
    rating: Number(firstValue(feedback.rating, 0)),
    comment: firstValue(feedback.comment, ''),
  }
}

const parseAllergies = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

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

const isUpcomingAppointment = (scheduledAt) => isDateTimeFuture(scheduledAt)

const canCancelAppointment = (scheduledAt) => hoursUntil(scheduledAt) > 24

const getNextBookableDate = () => {
  let nextDate = addDaysToDateKey(getSydneyToday(), 1)

  while (nextDate && !isClinicDay(nextDate)) {
    nextDate = addDaysToDateKey(nextDate, 1)
  }

  return nextDate
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

function ErrorBanner({ message }) {
  if (!message) {
    return null
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </div>
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

function StepPill({ step, currentStep, label }) {
  const active = step === currentStep
  const completed = step < currentStep

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
        active
          ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
          : completed
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-white text-slate-500'
      }`}
    >
      {step}. {label}
    </div>
  )
}

function PatientPortal() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const storedUser = getStoredUser()
  const patientId = firstValue(
    storedUser?.id,
    storedUser?._id,
    storedUser?.patient_id,
    storedUser?.patientId,
    '',
  )
  const patientLabel = patientId ? `Patient #${patientId}` : 'Patient'
  const tomorrow = useMemo(() => getNextBookableDate(), [])

  const [activeTab, setActiveTab] = useState('appointments')
  const [cancelDialogAppointment, setCancelDialogAppointment] = useState(null)
  const [bookingStep, setBookingStep] = useState(1)
  const [bookingDraft, setBookingDraft] = useState({
    doctor_id: '',
    date: '',
    time: '',
  })
  const [bookingSuccess, setBookingSuccess] = useState(null)
  const [feedbackDrafts, setFeedbackDrafts] = useState({})

  const intakeForm = useForm(
    {
      symptoms: '',
      current_medications: '',
      allergies: '',
      insurance_info: '',
    },
    {
      symptoms: [required],
    },
  )
  const { reset: resetIntakeForm } = intakeForm

  const bookingDateForm = useForm(
    {
      date: '',
    },
    {
      date: [required, validateFuture, validateClinicDay],
    },
  )

  const appointmentsQuery = useQuery({
    queryKey: ['patient', 'appointments', patientId],
    queryFn: async () => {
      const payload = await getPatientAppointments(patientId)
      return ensureArray(payload, ['appointments', 'data']).map(normalizeAppointment)
    },
    enabled: Boolean(patientId),
  })

  const doctorsQuery = useQuery({
    queryKey: ['patient', 'booking', 'doctors'],
    queryFn: async () => {
      const payload = await getDoctors()
      return ensureArray(payload, ['doctors', 'data']).map(normalizeDoctor)
    },
    enabled: activeTab === 'booking' && Boolean(patientId),
  })

  const slotsQuery = useQuery({
    queryKey: ['patient', 'booking', 'slots', bookingDraft.doctor_id, bookingDraft.date],
    queryFn: async () => {
      const payload = await getSlots(bookingDraft.doctor_id, bookingDraft.date)
      return normalizeSlots(payload).filter(Boolean)
    },
    enabled:
      activeTab === 'booking' &&
      Boolean(bookingDraft.doctor_id && bookingDraft.date) &&
      isClinicDay(bookingDraft.date) &&
      isFuture(bookingDraft.date),
  })

  const allAppointments = appointmentsQuery.data || []
  const doctors = doctorsQuery.data || []
  const selectedDoctor =
    doctors.find((doctor) => String(doctor.id) === String(bookingDraft.doctor_id)) || null

  const upcomingAppointments = useMemo(
    () =>
      [...allAppointments]
        .filter(
          (appointment) =>
            isUpcomingAppointment(appointment.scheduled_at) &&
            String(appointment.status).toLowerCase() !== 'cancelled',
        )
        .sort(
          (first, second) =>
            new Date(first.scheduled_at).getTime() - new Date(second.scheduled_at).getTime(),
        ),
    [allAppointments],
  )

  const completedAppointments = useMemo(
    () =>
      [...allAppointments]
        .filter((appointment) => String(appointment.status).toLowerCase() === 'completed')
        .sort(
          (first, second) =>
            new Date(second.scheduled_at).getTime() - new Date(first.scheduled_at).getTime(),
        ),
    [allAppointments],
  )

  const pendingIntakeAppointment = useMemo(
    () => upcomingAppointments.find((appointment) => !hasIntake(appointment)) || null,
    [upcomingAppointments],
  )

  const submittedIntakeAppointment = useMemo(
    () =>
      upcomingAppointments.find(
        (appointment) => appointment.id !== pendingIntakeAppointment?.id && hasIntake(appointment),
      ) || null,
    [pendingIntakeAppointment?.id, upcomingAppointments],
  )

  const submittedIntakeQuery = useQuery({
    queryKey: ['patient', 'intake-form', submittedIntakeAppointment?.id],
    queryFn: () => getIntakeForm(submittedIntakeAppointment.id),
    enabled: Boolean(submittedIntakeAppointment?.id),
    retry: false,
  })

  useEffect(() => {
    resetIntakeForm({
      symptoms: '',
      current_medications: '',
      allergies: '',
      insurance_info: '',
    })
  }, [pendingIntakeAppointment?.id, resetIntakeForm])

  const cancelMutation = useMutation({
    mutationFn: cancelAppointment,
    onSuccess: async () => {
      setCancelDialogAppointment(null)
      showToast('Appointment cancelled successfully.', 'success')
      await queryClient.invalidateQueries({ queryKey: ['patient', 'appointments', patientId] })
    },
    onError: (error) => {
      showToast(getApiErrorMessage(error, 'Unable to cancel appointment.'), 'error')
    },
  })

  const intakeMutation = useMutation({
    mutationFn: submitIntakeForm,
    onSuccess: async () => {
      showToast('Intake form submitted successfully.', 'success')
      await queryClient.invalidateQueries({ queryKey: ['patient', 'appointments', patientId] })
      await queryClient.invalidateQueries({ queryKey: ['patient', 'intake-form'] })
    },
    onError: (error) => {
      showToast(getApiErrorMessage(error, 'Unable to submit intake form.'), 'error')
    },
  })

  const feedbackMutation = useMutation({
    mutationFn: submitFeedback,
    onSuccess: async (_, variables) => {
      showToast('Feedback submitted. Thank you.', 'success')
      setFeedbackDrafts((current) => ({
        ...current,
        [variables.appointment_id]: {
          ...current[variables.appointment_id],
          submitted: true,
        },
      }))
      await queryClient.invalidateQueries({ queryKey: ['patient', 'appointments', patientId] })
    },
    onError: (error) => {
      showToast(getApiErrorMessage(error, 'Unable to submit feedback.'), 'error')
    },
  })

  const bookingMutation = useMutation({
    mutationFn: createAppointment,
    onSuccess: async (response) => {
      const appointment = normalizeAppointment({
        ...response,
        doctor_name: selectedDoctor?.full_name,
        doctor_id: selectedDoctor?.id,
        patient_id: patientId,
        scheduled_at: combineDateAndTime(bookingDraft.date, bookingDraft.time),
        status: firstValue(response?.status, 'pending'),
      })

      setBookingSuccess(appointment)
      setBookingStep(5)
      showToast('Appointment booked successfully.', 'success')
      await queryClient.invalidateQueries({ queryKey: ['patient', 'appointments', patientId] })
    },
    onError: (error) => {
      showToast(getApiErrorMessage(error, 'Unable to create appointment.'), 'error')
    },
  })

  const pendingFeedbackAppointments = useMemo(
    () => completedAppointments.filter((appointment) => !hasFeedback(appointment)),
    [completedAppointments],
  )

  const submittedFeedbackAppointments = useMemo(
    () => completedAppointments.filter((appointment) => hasFeedback(appointment)),
    [completedAppointments],
  )

  const intakeReadOnlyData =
    submittedIntakeQuery.data ||
    submittedIntakeAppointment?.intake_form ||
    submittedIntakeAppointment?.intakeForm ||
    null

  const handleLogout = () => {
    clearStoredAuth()
    navigate('/login', { replace: true })
  }

  const handleBookingDoctorSelect = (doctorId) => {
    setBookingDraft({
      doctor_id: doctorId,
      date: '',
      time: '',
    })
    bookingDateForm.reset({ date: '' })
    setBookingSuccess(null)
    setBookingStep(doctorId ? 2 : 1)
  }

  const handleBookingDateSubmit = () => {
    if (!bookingDateForm.validateAll()) {
      return
    }

    const selectedDate = bookingDateForm.values.date
    setBookingDraft((current) => ({
      ...current,
      date: selectedDate,
      time: '',
    }))
    setBookingStep(3)
  }

  const handleBookAppointment = () => {
    if (!bookingDraft.doctor_id || !bookingDraft.date || !bookingDraft.time || !patientId) {
      showToast('Please complete all booking steps first.', 'warning')
      return
    }

    bookingMutation.mutate({
      patient_id: patientId,
      doctor_id: bookingDraft.doctor_id,
      scheduled_at: combineDateAndTime(bookingDraft.date, bookingDraft.time),
      booking_source: 'patient_portal',
    })
  }

  const handleBookingDateChange = (event) => {
    const { value } = event.target

    if (value) {
      const day = new Date(`${value}T00:00:00`).getDay()

      if (day === 0) {
        showToast('Clinic is closed on Sundays. Please select another day.', 'warning')
        return
      }
    }

    if (value && !isClinicDay(value)) {
      showToast('Clinic is closed on Sundays. Please select another day.', 'warning')
      return
    }

    bookingDateForm.handleChange(event)
  }

  const renderAppointmentsTab = () => {
    if (appointmentsQuery.isLoading) {
      return <LoadingSpinner />
    }

    if (appointmentsQuery.isError) {
      return (
        <ErrorBanner
          message={getApiErrorMessage(appointmentsQuery.error, 'Failed to load appointments.')}
        />
      )
    }

    if (!upcomingAppointments.length) {
      return (
        <EmptyState
          actionLabel="Book Appointment"
          icon="C"
          message="You do not have any upcoming appointments yet."
          onAction={() => setActiveTab('booking')}
          title="No Upcoming Appointments"
        />
      )
    }

    return (
      <div className="space-y-4">
        {upcomingAppointments.map((appointment) => {
          const canCancel = canCancelAppointment(appointment.scheduled_at)

          return (
            <article key={appointment.id} className={PANEL_CLASSES}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                    Doctor
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    {appointment.doctor_name}
                  </h3>
                </div>
                <StatusBadge status={appointment.status} />
              </div>

              <div className="mt-4 grid gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 text-sm text-slate-700 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-cyan-700">Date</p>
                  <p className="mt-1 font-semibold">
                    {isToday(appointment.scheduled_at)
                      ? 'Today'
                      : formatDate(appointment.scheduled_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-cyan-700">Time</p>
                  <p className="mt-1 font-semibold">{formatTime(appointment.scheduled_at)}</p>
                </div>
                <div className="sm:col-span-2">
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
                  onClick={() => setCancelDialogAppointment(appointment)}
                  type="button"
                >
                  {cancelMutation.isPending &&
                  String(cancelDialogAppointment?.id) === String(appointment.id)
                    ? 'Cancelling...'
                    : 'Cancel Appointment'}
                </button>
              ) : (
                <p className="mt-4 text-xs text-slate-500">
                  Cancellations are available only more than 24 hours before the appointment.
                </p>
              )}
            </article>
          )
        })}
      </div>
    )
  }

  const renderBookingTab = () => {
    if (doctorsQuery.isLoading) {
      return <LoadingSpinner />
    }

    if (doctorsQuery.isError) {
      return (
        <ErrorBanner
          message={getApiErrorMessage(doctorsQuery.error, 'Failed to load doctors.')}
        />
      )
    }

    return (
      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-5">
          <StepPill currentStep={bookingStep} label="Doctor" step={1} />
          <StepPill currentStep={bookingStep} label="Date" step={2} />
          <StepPill currentStep={bookingStep} label="Slot" step={3} />
          <StepPill currentStep={bookingStep} label="Confirm" step={4} />
          <StepPill currentStep={bookingStep} label="Success" step={5} />
        </div>

        <section className={PANEL_CLASSES}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Step 1
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Select a doctor</h3>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {doctors.map((doctor) => {
              const selected = String(doctor.id) === String(bookingDraft.doctor_id)
              return (
                <button
                  key={doctor.id}
                  className={`rounded-3xl border p-5 text-left transition ${
                    selected
                      ? 'border-cyan-300 bg-cyan-50 ring-2 ring-cyan-100'
                      : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-slate-50'
                  }`}
                  onClick={() => handleBookingDoctorSelect(doctor.id)}
                  type="button"
                >
                  <p className="text-lg font-semibold text-slate-900">{doctor.full_name}</p>
                  <p className="mt-2 text-sm text-slate-600">{doctor.specialty}</p>
                  <p className="mt-4 text-xs uppercase tracking-[0.16em] text-slate-500">
                    Availability Days
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {doctor.working_days.join(', ') || 'Mon-Sat'}
                  </p>
                  <p className="mt-3 text-sm text-slate-600">
                    {doctor.start_time || '09:00'} to {doctor.end_time || '17:00'}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        {selectedDoctor ? (
          <section className={PANEL_CLASSES}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
              Step 2
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Choose a date</h3>
            <p className="mt-2 text-sm text-slate-600">
              Bookings are available Monday to Saturday and must be for a future date in the
              Australia/Sydney clinic timezone.
            </p>

            <form className="mt-5 max-w-md space-y-3" onSubmit={bookingDateForm.handleSubmit(handleBookingDateSubmit)}>
              <label className="block text-sm font-medium text-slate-700">
                Appointment date
                <input
                  className={`mt-2 min-h-[44px] w-full rounded-2xl border px-4 text-sm outline-none transition ${
                    bookingDateForm.errors.date ? 'border-rose-400' : 'border-slate-200'
                  }`}
                  min={tomorrow}
                  name="date"
                  onBlur={bookingDateForm.handleBlur}
                  onChange={handleBookingDateChange}
                  type="date"
                  value={bookingDateForm.values.date}
                />
              </label>
              <p className="mt-1 text-sm text-slate-500">Available Monday to Saturday only</p>
              {bookingDateForm.errors.date ? (
                <p className="text-sm text-rose-600">{bookingDateForm.errors.date}</p>
              ) : null}

              <button
                className="min-h-[44px] rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700"
                type="submit"
              >
                Continue to Slots
              </button>
            </form>
          </section>
        ) : null}

        {bookingStep >= 3 && bookingDraft.date ? (
          <section className={PANEL_CLASSES}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
              Step 3
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Select a time slot</h3>
            <p className="mt-2 text-sm text-slate-600">
              Showing only available slots for {selectedDoctor?.full_name} on{' '}
              {formatDate(bookingDraft.date)}.
            </p>

            {slotsQuery.isLoading ? (
              <LoadingSpinner />
            ) : slotsQuery.isError ? (
              <ErrorBanner
                message={getApiErrorMessage(slotsQuery.error, 'Failed to load available slots.')}
              />
            ) : slotsQuery.data?.length ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {slotsQuery.data.map((slot) => {
                  const selected = slot === bookingDraft.time
                  return (
                    <button
                      key={slot}
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        selected
                          ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-200 hover:bg-slate-50'
                      }`}
                      onClick={() => {
                        setBookingDraft((current) => ({ ...current, time: slot }))
                        setBookingStep(4)
                      }}
                      type="button"
                    >
                      {formatTime(slot)}
                    </button>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon="T"
                message="There are no remaining appointment slots for this date."
                title="No Available Slots"
              />
            )}
          </section>
        ) : null}

        {bookingStep >= 4 && bookingDraft.time ? (
          <section className={PANEL_CLASSES}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
              Step 4
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Confirm booking details</h3>

            <div className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Patient</p>
                <p className="mt-1 font-semibold text-slate-900">{patientLabel}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Doctor</p>
                <p className="mt-1 font-semibold text-slate-900">{selectedDoctor?.full_name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Specialty</p>
                <p className="mt-1 font-semibold text-slate-900">{selectedDoctor?.specialty}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Date & Time</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {formatDateTime(combineDateAndTime(bookingDraft.date, bookingDraft.time))}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="min-h-[44px] rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setBookingStep(3)}
                type="button"
              >
                Back to Slots
              </button>
              <button
                className="min-h-[44px] rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={bookingMutation.isPending}
                onClick={handleBookAppointment}
                type="button"
              >
                {bookingMutation.isPending ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </section>
        ) : null}

        {bookingStep === 5 && bookingSuccess ? (
          <section className={PANEL_CLASSES}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Step 5
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Booking confirmed</h3>
            <p className="mt-2 text-sm text-slate-600">
              Your appointment has been created successfully.
            </p>

            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">{bookingSuccess.doctor_name}</p>
              <p className="mt-1">{formatDateTime(bookingSuccess.scheduled_at)}</p>
              <p className="mt-1 capitalize">Status: {bookingSuccess.status}</p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="min-h-[44px] rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700"
                onClick={() => setActiveTab('appointments')}
                type="button"
              >
                View Appointments
              </button>
              <button
                className="min-h-[44px] rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => {
                  setBookingDraft({ doctor_id: '', date: '', time: '' })
                  setBookingSuccess(null)
                  bookingDateForm.reset({ date: '' })
                  setBookingStep(1)
                }}
                type="button"
              >
                Book Another Appointment
              </button>
            </div>
          </section>
        ) : null}
      </div>
    )
  }

  const renderIntakeTab = () => {
    if (appointmentsQuery.isLoading) {
      return <LoadingSpinner />
    }

    if (appointmentsQuery.isError) {
      return (
        <ErrorBanner
          message={getApiErrorMessage(appointmentsQuery.error, 'Failed to load intake details.')}
        />
      )
    }

    if (!pendingIntakeAppointment && !submittedIntakeAppointment) {
      return (
        <EmptyState
          icon="I"
          message="Your upcoming appointments do not need an intake form right now."
          title="No Intake Pending"
        />
      )
    }

    if (pendingIntakeAppointment) {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
            Intake form for {pendingIntakeAppointment.doctor_name} on{' '}
            {formatDate(pendingIntakeAppointment.scheduled_at)} at{' '}
            {formatTime(pendingIntakeAppointment.scheduled_at)}.
          </div>

          <form
            className={`${PANEL_CLASSES} space-y-4`}
            onSubmit={intakeForm.handleSubmit((values) => {
              intakeMutation.mutate({
                appointment_id: pendingIntakeAppointment.id,
                patient_id: patientId || pendingIntakeAppointment.patient_id,
                symptoms: values.symptoms,
                current_medications: values.current_medications,
                allergies: parseAllergies(values.allergies),
                insurance_info: values.insurance_info,
              })
            })}
          >
            <label className="block text-sm font-medium text-slate-700">
              Symptoms
              <textarea
                className={`mt-2 min-h-[120px] w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 outline-none transition ${
                  intakeForm.errors.symptoms ? 'border-rose-400' : 'border-slate-200'
                }`}
                name="symptoms"
                onBlur={intakeForm.handleBlur}
                onChange={intakeForm.handleChange}
                rows={4}
                value={intakeForm.values.symptoms}
              />
            </label>
            {intakeForm.errors.symptoms ? (
              <p className="text-sm text-rose-600">{intakeForm.errors.symptoms}</p>
            ) : null}

            <label className="block text-sm font-medium text-slate-700">
              Current medications
              <textarea
                className="mt-2 min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                name="current_medications"
                onBlur={intakeForm.handleBlur}
                onChange={intakeForm.handleChange}
                rows={4}
                value={intakeForm.values.current_medications}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Allergies (comma separated)
              <input
                className="mt-2 min-h-[44px] w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                name="allergies"
                onBlur={intakeForm.handleBlur}
                onChange={intakeForm.handleChange}
                type="text"
                value={intakeForm.values.allergies}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Insurance info
              <input
                className="mt-2 min-h-[44px] w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                name="insurance_info"
                onBlur={intakeForm.handleBlur}
                onChange={intakeForm.handleChange}
                type="text"
                value={intakeForm.values.insurance_info}
              />
            </label>

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

    if (submittedIntakeQuery.isLoading) {
      return <LoadingSpinner />
    }

    if (submittedIntakeQuery.isError && !intakeReadOnlyData) {
      return (
        <ErrorBanner
          message={getApiErrorMessage(submittedIntakeQuery.error, 'Failed to load intake form.')}
        />
      )
    }

    return (
      <div className={`${PANEL_CLASSES} space-y-4`}>
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
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
            Current Medications
          </p>
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
    if (appointmentsQuery.isLoading) {
      return <LoadingSpinner />
    }

    if (appointmentsQuery.isError) {
      return (
        <ErrorBanner
          message={getApiErrorMessage(appointmentsQuery.error, 'Failed to load appointment history.')}
        />
      )
    }

    if (!completedAppointments.length) {
      return (
        <EmptyState
          icon="H"
          message="Completed visits will appear here after your consultations."
          title="No Visit History"
        />
      )
    }

    return (
      <div className="space-y-4">
        {completedAppointments.map((appointment) => (
          <article key={appointment.id} className={PANEL_CLASSES}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                  Doctor
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {appointment.doctor_name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDateTime(appointment.scheduled_at)}
                </p>
              </div>
              <StatusBadge status={appointment.status} />
            </div>

            {appointment.notes ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Doctor Notes</p>
                <p className="mt-2 text-sm text-slate-700">{appointment.notes}</p>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    )
  }

  const renderFeedbackTab = () => {
    if (appointmentsQuery.isLoading) {
      return <LoadingSpinner />
    }

    if (appointmentsQuery.isError) {
      return (
        <ErrorBanner
          message={getApiErrorMessage(appointmentsQuery.error, 'Failed to load feedback items.')}
        />
      )
    }

    if (!completedAppointments.length) {
      return (
        <EmptyState
          icon="F"
          message="Feedback becomes available after completed appointments."
          title="No Feedback Yet"
        />
      )
    }

    return (
      <div className="space-y-6">
        {pendingFeedbackAppointments.length ? (
          <div className="space-y-4">
            {pendingFeedbackAppointments.map((appointment) => {
              const draft = feedbackDrafts[appointment.id] || { rating: 0, comment: '' }
              const isSubmitting =
                feedbackMutation.isPending &&
                String(feedbackMutation.variables?.appointment_id) === String(appointment.id)

              return (
                <article key={appointment.id} className={PANEL_CLASSES}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                        Feedback For
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">
                        {appointment.doctor_name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatDateTime(appointment.scheduled_at)}
                      </p>
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

                  <button
                    className="mt-4 min-h-[44px] w-full rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={isSubmitting || (draft.rating || 0) < 1 || draft.submitted}
                    onClick={() =>
                      feedbackMutation.mutate({
                        appointment_id: appointment.id,
                        patient_id: patientId || appointment.patient_id,
                        rating: draft.rating,
                        comment: draft.comment || '',
                      })
                    }
                    type="button"
                  >
                    {isSubmitting ? 'Submitting...' : draft.submitted ? 'Submitted' : 'Submit Feedback'}
                  </button>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon="A"
            message="You have already submitted feedback for all completed appointments."
            title="All Caught Up"
          />
        )}

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
                      <p className="text-sm text-slate-500">
                        {formatDateTime(appointment.scheduled_at)}
                      </p>
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
    booking: renderBookingTab(),
    intake: renderIntakeTab(),
    history: renderHistoryTab(),
    feedback: renderFeedbackTab(),
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
              Patient Portal
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">My Health Portal</h1>
            <p className="mt-1 text-sm text-slate-500">{patientLabel}</p>
          </div>

          <button
            className="min-h-[44px] rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={handleLogout}
            type="button"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-28">
        {!patientId ? (
          <ErrorBanner message="Your session is missing patient details. Please login again." />
        ) : (
          <>
            <section className="mb-6 rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_10px_35px_rgba(15,23,42,0.05)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">
                Australia/Sydney Clinic Time
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Manage appointments, booking, intake, and feedback in one place.
              </h2>
            </section>

            {tabContent[activeTab]}
          </>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-5 gap-2 px-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                className={`flex min-h-[56px] items-center justify-center rounded-xl px-2 text-xs font-semibold transition ${
                  isActive
                    ? 'border border-cyan-200 bg-cyan-50 text-cyan-700'
                    : 'border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </nav>

      <ConfirmDialog
        cancelText="Keep Appointment"
        confirmText={cancelMutation.isPending ? 'Cancelling...' : 'Cancel Appointment'}
        isOpen={Boolean(cancelDialogAppointment)}
        message={
          cancelDialogAppointment
            ? `Cancel your appointment with ${cancelDialogAppointment.doctor_name} on ${formatDateTime(cancelDialogAppointment.scheduled_at)}?`
            : ''
        }
        onCancel={() => setCancelDialogAppointment(null)}
        onConfirm={() => cancelMutation.mutate(cancelDialogAppointment.id)}
        title="Confirm Cancellation"
        variant="danger"
      />
    </div>
  )
}

export default PatientPortal
