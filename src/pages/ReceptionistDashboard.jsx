
import { useMemo, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import AppointmentCalendar from '../components/AppointmentCalendar.jsx'
import SharedEmptyState from '../components/ui/EmptyState.jsx'
import SharedLoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import Pagination from '../components/ui/Pagination.jsx'
import { clearStoredAuth, getStoredUser } from '../lib/auth.js'
import {
  combineDateAndTime,
  formatDate,
  formatDateTime,
  formatTime,
  getSydneyToday,
  isToday,
} from '../lib/datetime.js'
import { coerceBoolean, normalizeSlotOptions } from '../lib/clinicData.js'
import { useForm } from '../lib/useForm.js'
import { isEmail, isPhone, minLength, required } from '../lib/validators.js'
import {
  createAppointment as createAppointmentService,
  getAppointments as fetchAppointments,
  getPatientAppointments as fetchPatientAppointments,
  getSlots as fetchSlots,
  rescheduleAppointment,
  updateAppointmentStatus,
} from '../services/appointments.js'
import { getDoctors as fetchDoctors } from '../services/doctors.js'
import {
  createPatient as createPatientService,
  getPatientByPhone as fetchPatientByPhone,
  getPatients as fetchPatients,
  updatePatient as updatePatientService,
} from '../services/patients.js'
import { createWaitlist, getWaitlist as fetchWaitlist, updateWaitlistStatus } from '../services/waitlist.js'

const NAV_ITEMS = [
  { key: 'checkin', label: 'Check-In Board', icon: '📋' },
  { key: 'book', label: 'Quick Book', icon: '➕' },
  { key: 'waitlist', label: 'Waitlist', icon: '⏳' },
  { key: 'search', label: 'Patient Search', icon: '🔍' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
]

const STATUS_STYLES = {
  confirmed: 'bg-sky-100 text-sky-700 ring-sky-200',
  completed: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-rose-100 text-rose-700 ring-rose-200',
  no_show: 'bg-orange-100 text-orange-700 ring-orange-200',
  pending: 'bg-amber-100 text-amber-800 ring-amber-200',
  offered: 'bg-teal-100 text-teal-700 ring-teal-200',
  expired: 'bg-slate-200 text-slate-700 ring-slate-300',
}

const inputClasses =
  'mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100'

const cardClasses = 'rounded-3xl border border-slate-200 bg-white shadow-sm'
const EMPTY_ARRAY = []
const PAGE_SIZE = 10
const QUICK_BOOK_FORM_INITIAL_VALUES = {
  phone: '',
  patient_id: '',
  full_name: '',
  email: '',
  gender: '',
  date_of_birth: '',
  allergies: '',
  medical_notes: '',
  doctor_id: '',
  date: '',
  time: '',
  notes: '',
}
const WAITLIST_FORM_INITIAL_VALUES = {
  phone: '',
  patient_id: '',
  full_name: '',
  email: '',
  gender: '',
  date_of_birth: '',
  allergies: '',
  medical_notes: '',
  doctor_id: '',
  preferred_date: '',
}
const PATIENT_EDIT_FORM_INITIAL_VALUES = {
  full_name: '',
  phone: '',
  email: '',
  gender: '',
  date_of_birth: '',
  allergies: '',
  medical_notes: '',
}
const PATIENT_VALIDATION_RULES = {
  full_name: [required, (value) => minLength(value, 2)],
  phone: [required, isPhone],
  email: [isEmail],
}

const getInputStateClasses = (error) =>
  error
    ? `${inputClasses} border-red-500 focus:border-red-500 focus:ring-red-100`
    : inputClasses

const ensureArray = (value, keys = []) => {
  if (Array.isArray(value)) return value

  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }

  return []
}

const firstValue = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '')

const getTotalCount = (payload, fallback = 0) => {
  const total = Number(
    firstValue(
      payload?.total,
      payload?.count,
      payload?.pagination?.total,
      payload?.meta?.total,
      fallback,
    ),
  )

  return Number.isFinite(total) ? total : fallback
}

const normalizePatient = (patient = {}) => ({
  id: firstValue(patient.id, patient._id, patient.patient_id, ''),
  full_name: firstValue(patient.full_name, patient.name, 'Unnamed patient'),
  phone: firstValue(patient.phone, ''),
  email: firstValue(patient.email, ''),
  gender: firstValue(patient.gender, ''),
  date_of_birth: firstValue(patient.date_of_birth, patient.dob, ''),
  allergies: firstValue(patient.allergies, ''),
  medical_notes: firstValue(patient.medical_notes, patient.notes, ''),
  created_at: firstValue(patient.created_at, patient.createdAt, ''),
})

const normalizeDoctor = (doctor = {}) => ({
  id: firstValue(doctor.id, doctor._id, doctor.doctor_id, doctor.email, ''),
  full_name: firstValue(doctor.full_name, doctor.name, 'Unnamed doctor'),
  specialty: firstValue(doctor.specialty, doctor.specialisation, 'General'),
  slot_duration_mins: Number(
    firstValue(doctor.slot_duration_mins, doctor.slotDurationMins, 15),
  ),
  accepting_patients: coerceBoolean(
    firstValue(
      doctor.accepting_patients,
      doctor.acceptingPatients,
      doctor.is_accepting_patients,
      doctor.isAcceptingPatients,
      true,
    ),
    true,
  ),
})

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
  doctor_name: firstValue(
    appointment.doctor_name,
    appointment.doctorName,
    appointment.doctor?.full_name,
    appointment.doctor?.name,
    'Unknown doctor',
  ),
  doctor_id: firstValue(
    appointment.doctor_id,
    appointment.doctor?.id,
    appointment.doctor?._id,
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
  notes: firstValue(appointment.notes, ''),
})

const normalizeWaitlist = (entry = {}) => ({
  id: firstValue(entry.id, entry._id, entry.waitlist_id, ''),
  patient_name: firstValue(
    entry.patient_name,
    entry.patient?.full_name,
    entry.patient?.name,
    'Unknown patient',
  ),
  patient_id: firstValue(entry.patient_id, entry.patient?.id, entry.patient?._id, ''),
  doctor_name: firstValue(
    entry.doctor_name,
    entry.doctor?.full_name,
    entry.doctor?.name,
    'Unknown doctor',
  ),
  doctor_id: firstValue(entry.doctor_id, entry.doctor?.id, entry.doctor?._id, ''),
  requested_date: firstValue(entry.requested_date, entry.date, ''),
  added_at: firstValue(entry.added_at, entry.created_at, ''),
  status: firstValue(entry.status, 'active'),
})

const getPatients = (payload) =>
  ensureArray(payload, ['patients', 'data']).map(normalizePatient)

const getDoctors = (payload) =>
  ensureArray(payload, ['doctors', 'data']).map(normalizeDoctor)

const getAppointments = (payload) =>
  ensureArray(payload, ['appointments', 'data']).map(normalizeAppointment)

const getWaitlist = (payload) =>
  ensureArray(payload, ['waitlist', 'data']).map(normalizeWaitlist)

const getErrorMessage = (error, fallback = 'Something went wrong.') =>
  firstValue(
    error?.response?.data?.message,
    error?.response?.data?.error,
    error?.message,
    fallback,
  )

const isNotFoundError = (error) => error?.response?.status === 404

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

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
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

function Modal({ open, title, onClose, children, maxWidth = 'max-w-3xl' }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`max-h-[90vh] w-full ${maxWidth} overflow-y-auto rounded-3xl bg-white shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
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
      </div>
    </div>
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

function ReceptionistDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const today = getSydneyToday()
  const currentUser = getStoredUser()
  const receptionistEmail = firstValue(currentUser?.email, 'reception@clinic.com')

  const [activeSection, setActiveSection] = useState('checkin')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [appointmentsPage, setAppointmentsPage] = useState(1)
  const [patientsPage, setPatientsPage] = useState(1)
  const [waitlistPage, setWaitlistPage] = useState(1)
  const [checkInReschedule, setCheckInReschedule] = useState(null)
  const [rescheduleForm, setRescheduleForm] = useState({ date: today, time: '' })
  const [waitlistModalOpen, setWaitlistModalOpen] = useState(false)
  const [quickBookSuccess, setQuickBookSuccess] = useState(null)
  const quickBookFormState = useForm(
    { ...QUICK_BOOK_FORM_INITIAL_VALUES, date: today },
    PATIENT_VALIDATION_RULES,
  )
  const waitlistFormState = useForm(
    { ...WAITLIST_FORM_INITIAL_VALUES, preferred_date: today },
    PATIENT_VALIDATION_RULES,
  )
  const patientEditFormState = useForm(
    PATIENT_EDIT_FORM_INITIAL_VALUES,
    PATIENT_VALIDATION_RULES,
  )
  const quickBookForm = quickBookFormState.values
  const waitlistForm = waitlistFormState.values
  const patientEditForm = patientEditFormState.values
  const setQuickBookForm = (updater) => {
    const nextValues =
      typeof updater === 'function' ? updater(quickBookFormState.values) : updater
    quickBookFormState.setValues(nextValues)
  }
  const setWaitlistForm = (updater) => {
    const nextValues =
      typeof updater === 'function' ? updater(waitlistFormState.values) : updater
    waitlistFormState.setValues(nextValues)
  }
  const doctorsQuery = useQuery({
    queryKey: ['doctors'],
    queryFn: async () => getDoctors(await fetchDoctors()),
  })

  const todayAppointmentsQuery = useQuery({
    queryKey: ['reception', 'appointments', 'today', today, appointmentsPage],
    queryFn: () => fetchAppointments({ date: today, page: appointmentsPage }),
  })

  const waitlistQuery = useQuery({
    queryKey: ['waitlist', waitlistPage],
    queryFn: () => fetchWaitlist({ page: waitlistPage }),
    enabled: activeSection === 'waitlist',
  })

  const patientsQuery = useQuery({
    queryKey: ['patients', searchTerm, patientsPage],
    queryFn: () => fetchPatients(patientsPage, searchTerm),
    enabled: activeSection === 'search',
  })

  const patientAppointmentsQuery = useQuery({
    queryKey: ['appointments', 'patient', selectedPatient?.id],
    queryFn: async () => getAppointments(await fetchPatientAppointments(selectedPatient.id)),
    enabled: Boolean(selectedPatient?.id),
  })

  const quickLookupQuery = useQuery({
    queryKey: ['patients', 'phone', 'quick-book', quickBookForm.phone],
    queryFn: async () => normalizePatient(await fetchPatientByPhone(quickBookForm.phone)),
    enabled: activeSection === 'book' && quickBookForm.phone.trim().length >= 5,
    retry: false,
  })

  const waitlistLookupQuery = useQuery({
    queryKey: ['patients', 'phone', 'waitlist', waitlistForm.phone],
    queryFn: async () => normalizePatient(await fetchPatientByPhone(waitlistForm.phone)),
    enabled: waitlistModalOpen && waitlistForm.phone.trim().length >= 5,
    retry: false,
  })

  const quickSlotsQuery = useQuery({
    queryKey: ['appointments', 'slots', 'quick-book', quickBookForm.doctor_id, quickBookForm.date],
    queryFn: async () =>
      normalizeSlotOptions(await fetchSlots(quickBookForm.doctor_id, quickBookForm.date)),
    enabled: activeSection === 'book' && Boolean(quickBookForm.doctor_id && quickBookForm.date),
  })

  const rescheduleSlotsQuery = useQuery({
    queryKey: ['appointments', 'slots', 'reschedule', checkInReschedule?.doctor_id, rescheduleForm.date],
    queryFn: async () =>
      normalizeSlotOptions(await fetchSlots(checkInReschedule.doctor_id, rescheduleForm.date)),
    enabled: Boolean(checkInReschedule?.doctor_id && rescheduleForm.date),
  })

  const invalidateCoreData = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['appointments'] }),
      queryClient.invalidateQueries({ queryKey: ['patients'] }),
      queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
      queryClient.invalidateQueries({ queryKey: ['reception'] }),
    ])

  const appointmentStatusMutation = useMutation({
    mutationFn: ({ id, status }) => updateAppointmentStatus(id, status),
    onSuccess: invalidateCoreData,
  })

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, status, scheduled_at }) => {
      await rescheduleAppointment(id, { scheduled_at })
      await updateAppointmentStatus(id, status)
    },
    onSuccess: async () => {
      await invalidateCoreData()
      setCheckInReschedule(null)
      setRescheduleForm({ date: today, time: '' })
    },
  })

  const createPatientMutation = useMutation({
    mutationFn: async (payload) => normalizePatient(await createPatientService(payload)),
    onSuccess: invalidateCoreData,
  })

  const createAppointmentMutation = useMutation({
    mutationFn: createAppointmentService,
    onSuccess: async () => {
      await invalidateCoreData()
    },
  })

  const waitlistStatusMutation = useMutation({
    mutationFn: ({ id, status }) => updateWaitlistStatus(id, status),
    onSuccess: invalidateCoreData,
  })

  const createWaitlistMutation = useMutation({
    mutationFn: createWaitlist,
    onSuccess: async () => {
      await invalidateCoreData()
      setWaitlistModalOpen(false)
      waitlistFormState.reset({ ...WAITLIST_FORM_INITIAL_VALUES, preferred_date: today })
    },
  })

  const updatePatientMutation = useMutation({
    mutationFn: ({ id, payload }) => updatePatientService(id, payload),
    onSuccess: invalidateCoreData,
  })

  const doctors = doctorsQuery.data || EMPTY_ARRAY
  const todayAppointmentsPayload = todayAppointmentsQuery.data || EMPTY_ARRAY
  const waitlistPayload = waitlistQuery.data || EMPTY_ARRAY
  const patientsPayload = patientsQuery.data || EMPTY_ARRAY
  const todayAppointments = getAppointments(todayAppointmentsPayload)
  const waitlist = getWaitlist(waitlistPayload)
  const searchedPatients = getPatients(patientsPayload)
  const patientAppointments = patientAppointmentsQuery.data || EMPTY_ARRAY
  const quickLookupPatient = quickLookupQuery.data || null
  const waitlistLookupPatient = waitlistLookupQuery.data || null
  const todayAppointmentsTotal = getTotalCount(todayAppointmentsPayload, todayAppointments.length)
  const waitlistTotal = getTotalCount(waitlistPayload, waitlist.length)
  const patientsTotal = getTotalCount(patientsPayload, searchedPatients.length)

  const quickBookingPatient = quickLookupPatient || {
    id: quickBookForm.patient_id,
    full_name: quickBookForm.full_name,
    phone: quickBookForm.phone,
    email: quickBookForm.email,
    gender: quickBookForm.gender,
    date_of_birth: quickBookForm.date_of_birth,
    allergies: quickBookForm.allergies,
    medical_notes: quickBookForm.medical_notes,
  }

  const waitlistBookingPatient = waitlistLookupPatient || {
    id: waitlistForm.patient_id,
    full_name: waitlistForm.full_name,
    phone: waitlistForm.phone,
    email: waitlistForm.email,
    gender: waitlistForm.gender,
    date_of_birth: waitlistForm.date_of_birth,
    allergies: waitlistForm.allergies,
    medical_notes: waitlistForm.medical_notes,
  }

  const sortedTodayAppointments = [...todayAppointments].sort(
    (a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime(),
  )

  const paginatedTodayAppointments = sortedTodayAppointments
  const paginatedWaitlist = waitlist
  const paginatedPatients = searchedPatients

  const todaySummary = useMemo(
    () => ({
      total: sortedTodayAppointments.length,
      confirmed: sortedTodayAppointments.filter((item) => item.status === 'confirmed').length,
      no_show: sortedTodayAppointments.filter((item) => item.status === 'no_show').length,
      remaining: sortedTodayAppointments.filter(
        (item) => !['completed', 'cancelled', 'no_show'].includes(item.status),
      ).length,
    }),
    [sortedTodayAppointments],
  )

  const pageTitle = NAV_ITEMS.find((item) => item.key === activeSection)?.label || 'Reception'

  const handleLogout = () => {
    clearStoredAuth()
    navigate('/login', { replace: true })
  }

  const handleSectionChange = (sectionKey) => {
    setActiveSection(sectionKey)
    setSidebarOpen(false)
  }

  const renderCheckInBoard = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Total Today', todaySummary.total, 'bg-cyan-50 text-cyan-700'],
          ['Confirmed', todaySummary.confirmed, 'bg-sky-50 text-sky-700'],
          ['No-Shows', todaySummary.no_show, 'bg-orange-50 text-orange-700'],
          ['Remaining', todaySummary.remaining, 'bg-emerald-50 text-emerald-700'],
        ].map(([label, value, accent]) => (
          <div key={label} className={`${cardClasses} p-6`}>
            <div className={`inline-flex rounded-2xl px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${accent}`}>
              {label}
            </div>
            <p className="mt-5 text-3xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <SectionShell
        description="Today’s appointments in chronological order with desk actions."
        title="Check-In Board"
      >
        {todayAppointmentsQuery.isLoading ? (
          <SharedLoadingSpinner size="md" />
        ) : todayAppointmentsQuery.isError ? (
          <ErrorBanner
            message={getErrorMessage(todayAppointmentsQuery.error, 'Failed to load appointments.')}
          />
        ) : sortedTodayAppointments.length === 0 ? (
          <SharedEmptyState message="No appointments scheduled for today." title="No Appointments" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Time</th>
                  <th className="pb-3 pr-4 font-medium">Patient</th>
                  <th className="pb-3 pr-4 font-medium">Doctor</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTodayAppointments.map((appointment) => (
                  <tr key={appointment.id} className="border-b border-slate-100 align-top">
                    <td className="py-4 pr-4 text-slate-600">{formatTime(appointment.date_time)}</td>
                    <td className="py-4 pr-4 font-medium text-slate-900">{appointment.patient_name}</td>
                    <td className="py-4 pr-4 text-slate-600">{appointment.doctor_name}</td>
                    <td className="py-4 pr-4">
                      <StatusBadge status={appointment.status} />
                    </td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                          onClick={() =>
                            appointmentStatusMutation.mutate({
                              id: appointment.id,
                              status: 'confirmed',
                            })
                          }
                          type="button"
                        >
                          Check In
                        </button>
                        <button
                          className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
                          onClick={() =>
                            appointmentStatusMutation.mutate({
                              id: appointment.id,
                              status: 'no_show',
                            })
                          }
                          type="button"
                        >
                          No Show
                        </button>
                        <button
                          className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                          onClick={() =>
                            appointmentStatusMutation.mutate({
                              id: appointment.id,
                              status: 'cancelled',
                            })
                          }
                          type="button"
                        >
                          Cancel
                        </button>
                        <button
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-700"
                          onClick={() => {
                            setCheckInReschedule(appointment)
                            setRescheduleForm({ date: today, time: '' })
                          }}
                          type="button"
                        >
                          Reschedule
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={appointmentsPage}
          totalPages={Math.max(1, Math.ceil(todayAppointmentsTotal / PAGE_SIZE))}
          onPageChange={setAppointmentsPage}
        />

        <div className="mt-4">
          <ErrorBanner
            message={
              appointmentStatusMutation.isError
                ? getErrorMessage(
                    appointmentStatusMutation.error,
                    'Unable to update appointment status.',
                  )
                : ''
            }
          />
        </div>
      </SectionShell>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Appointment Calendar</h2>
        <div className="mt-4">
          <AppointmentCalendar />
        </div>
      </div>
    </div>
  )

  const renderQuickBook = () => (
    <SectionShell description="Find or create a patient and confirm a receptionist booking fast." title="Quick Book">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Step 1</p>
          <Field label="Patient phone">
            <input
              className={getInputStateClasses(quickBookFormState.errors.phone)}
              name="phone"
              onBlur={quickBookFormState.handleBlur}
              onChange={(event) =>
                setQuickBookForm((current) => ({
                  ...current,
                  phone: event.target.value,
                  patient_id: '',
                  full_name: '',
                  email: '',
                  gender: '',
                  date_of_birth: '',
                  allergies: '',
                  medical_notes: '',
                }))
              }
              placeholder="0300 0000000"
              type="text"
              value={quickBookForm.phone}
            />
            {quickBookFormState.errors.phone ? (
              <p className="mt-1 text-sm text-red-500">{quickBookFormState.errors.phone}</p>
            ) : null}
          </Field>

          {quickLookupQuery.isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading...</p>
          ) : quickLookupPatient || quickBookForm.patient_id ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Patient ready: {quickBookingPatient.full_name}
            </div>
          ) : quickBookForm.phone.trim().length >= 5 &&
            (!quickLookupQuery.isError || isNotFoundError(quickLookupQuery.error)) ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm font-medium text-slate-700">New Patient</p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Full name">
                  <input
                    className={getInputStateClasses(quickBookFormState.errors.full_name)}
                    name="full_name"
                    onBlur={quickBookFormState.handleBlur}
                    onChange={(event) =>
                      setQuickBookForm((current) => ({ ...current, full_name: event.target.value }))
                    }
                    type="text"
                    value={quickBookForm.full_name}
                  />
                  {quickBookFormState.errors.full_name ? (
                    <p className="mt-1 text-sm text-red-500">{quickBookFormState.errors.full_name}</p>
                  ) : null}
                </Field>
                <Field label="Email">
                  <input
                    className={getInputStateClasses(quickBookFormState.errors.email)}
                    name="email"
                    onBlur={quickBookFormState.handleBlur}
                    onChange={(event) =>
                      setQuickBookForm((current) => ({ ...current, email: event.target.value }))
                    }
                    type="email"
                    value={quickBookForm.email}
                  />
                  {quickBookFormState.errors.email ? (
                    <p className="mt-1 text-sm text-red-500">{quickBookFormState.errors.email}</p>
                  ) : null}
                </Field>
                <Field label="Gender">
                  <select
                    className={inputClasses}
                    onChange={(event) =>
                      setQuickBookForm((current) => ({ ...current, gender: event.target.value }))
                    }
                    value={quickBookForm.gender}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Date of birth">
                  <input
                    className={inputClasses}
                    onChange={(event) =>
                      setQuickBookForm((current) => ({
                        ...current,
                        date_of_birth: event.target.value,
                      }))
                    }
                    type="date"
                    value={quickBookForm.date_of_birth}
                  />
                </Field>
                <Field label="Allergies (optional)">
                  <textarea
                    className={inputClasses}
                    onChange={(event) =>
                      setQuickBookForm((current) => ({
                        ...current,
                        allergies: event.target.value,
                      }))
                    }
                    rows="3"
                    value={quickBookForm.allergies}
                  />
                </Field>
                <Field label="Medical notes (optional)">
                  <textarea
                    className={inputClasses}
                    onChange={(event) =>
                      setQuickBookForm((current) => ({
                        ...current,
                        medical_notes: event.target.value,
                      }))
                    }
                    rows="3"
                    value={quickBookForm.medical_notes}
                  />
                </Field>
              </div>

              <div className="flex justify-end">
                <button
                  className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={
                    createPatientMutation.isPending ||
                    !quickBookFormState.isValid ||
                    !quickBookForm.full_name ||
                    !quickBookForm.phone ||
                    !quickBookForm.gender ||
                    !quickBookForm.date_of_birth
                  }
                  onClick={async () => {
                    if (!quickBookFormState.validateAll()) {
                      return
                    }

                    const created = await createPatientMutation.mutateAsync({
                      full_name: quickBookForm.full_name,
                      phone: quickBookForm.phone,
                      email: quickBookForm.email,
                      gender: quickBookForm.gender,
                      date_of_birth: quickBookForm.date_of_birth,
                      allergies: quickBookForm.allergies || undefined,
                      medical_notes: quickBookForm.medical_notes || undefined,
                    })

                    setQuickBookForm((current) => ({
                      ...current,
                      patient_id: created.id,
                      full_name: created.full_name,
                      email: created.email,
                      gender: created.gender,
                      date_of_birth: created.date_of_birth,
                      allergies: created.allergies || '',
                      medical_notes: created.medical_notes || '',
                    }))
                  }}
                  type="button"
                >
                  {createPatientMutation.isPending ? 'Creating...' : 'Create Patient'}
                </button>
              </div>
            </div>
          ) : null}

          {quickLookupQuery.isError && !isNotFoundError(quickLookupQuery.error) ? (
            <div className="mt-4">
              <ErrorBanner
                message={getErrorMessage(quickLookupQuery.error, 'Unable to look up patient.')}
              />
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Step 2</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Doctor">
              <select
                className={inputClasses}
                onChange={(event) =>
                  setQuickBookForm((current) => ({ ...current, doctor_id: event.target.value, time: '' }))
                }
                value={quickBookForm.doctor_id}
              >
                <option value="">Select doctor</option>
                {doctors.map((doctor) => (
                  <option
                    key={doctor.id}
                    disabled={!doctor.accepting_patients}
                    value={doctor.id}
                  >
                    {doctor.full_name}
                    {doctor.accepting_patients ? '' : ' (Not accepting patients)'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                className={inputClasses}
                onChange={(event) =>
                  setQuickBookForm((current) => ({ ...current, date: event.target.value, time: '' }))
                }
                type="date"
                value={quickBookForm.date}
              />
            </Field>
            <Field label="Time slot">
              <select
                className={inputClasses}
                onChange={(event) =>
                  setQuickBookForm((current) => ({ ...current, time: event.target.value }))
                }
                value={quickBookForm.time}
              >
                <option value="">Select slot</option>
                {(quickSlotsQuery.data || []).map((slot, index) => {
                  const value = typeof slot === 'string' ? slot : firstValue(slot.value, slot.time, '')
                  return (
                    <option key={value || index} value={value}>
                      {formatTime(value)}
                    </option>
                  )
                })}
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                className={inputClasses}
                onChange={(event) =>
                  setQuickBookForm((current) => ({ ...current, notes: event.target.value }))
                }
                rows="3"
                value={quickBookForm.notes}
              />
            </Field>
          </div>

          {doctorsQuery.isError ? (
            <div className="mt-4">
              <ErrorBanner
                message={getErrorMessage(doctorsQuery.error, 'Unable to load doctors.')}
              />
            </div>
          ) : null}
          {quickSlotsQuery.isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading available slots...</p>
          ) : null}
          {quickSlotsQuery.isError ? (
            <div className="mt-4">
              <ErrorBanner
                message={getErrorMessage(quickSlotsQuery.error, 'Unable to load slots.')}
              />
            </div>
          ) : null}
          {!quickSlotsQuery.isLoading &&
          !quickSlotsQuery.isError &&
          quickBookForm.doctor_id &&
          quickBookForm.date &&
          (quickSlotsQuery.data || []).length === 0 ? (
            <div className="mt-4">
              <EmptyState message="No available slots for the selected doctor and date." />
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Step 3</p>
          <div className="mt-4 grid gap-3 text-sm text-cyan-900 md:grid-cols-2">
            <p>Patient: {quickBookingPatient.full_name || 'Not selected'}</p>
            <p>
              Doctor:{' '}
              {doctors.find((doctor) => String(doctor.id) === String(quickBookForm.doctor_id))?.full_name ||
                'Not selected'}
            </p>
            <p>Date: {quickBookForm.date || 'Not selected'}</p>
            <p>Time: {quickBookForm.time ? formatTime(quickBookForm.time) : 'Not selected'}</p>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={
                createAppointmentMutation.isPending ||
                !quickBookForm.doctor_id ||
                !quickBookForm.time ||
                !quickBookingPatient.id
              }
              onClick={async () => {
                await createAppointmentMutation.mutateAsync({
                  patient_id: quickBookingPatient.id,
                  doctor_id: quickBookForm.doctor_id,
                  scheduled_at: combineDateAndTime(quickBookForm.date, quickBookForm.time),
                  booking_source: 'receptionist',
                  notes: quickBookForm.notes || undefined,
                })

                setQuickBookSuccess({
                  patient_name: quickBookingPatient.full_name || quickBookForm.full_name,
                  doctor_name:
                    doctors.find((doctor) => String(doctor.id) === String(quickBookForm.doctor_id))
                      ?.full_name || 'Doctor',
                  scheduled_at: combineDateAndTime(quickBookForm.date, quickBookForm.time),
                })
              }}
              type="button"
            >
              {createAppointmentMutation.isPending ? 'Booking...' : 'Confirm Booking'}
            </button>
          </div>
        </div>

        {quickBookSuccess ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
            Booking confirmed for {quickBookSuccess.patient_name} with {quickBookSuccess.doctor_name} on{' '}
            {formatDateTime(quickBookSuccess.scheduled_at)}.
          </div>
        ) : null}

        <ErrorBanner
          message={
            quickLookupQuery.isError
              ? ''
              : createPatientMutation.isError
                ? getErrorMessage(createPatientMutation.error, 'Unable to create patient.')
                : createAppointmentMutation.isError
                  ? getErrorMessage(createAppointmentMutation.error, 'Unable to create appointment.')
                  : ''
          }
        />
      </div>
    </SectionShell>
  )

  const renderWaitlist = () => (
    <SectionShell
      action={
        <button
          className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
          onClick={() => setWaitlistModalOpen(true)}
          type="button"
        >
          Add to Waitlist
        </button>
      }
      description="Offer open slots quickly and keep pending demand visible."
      title="Waitlist"
    >
      {waitlistQuery.isLoading ? (
        <SharedLoadingSpinner size="md" />
      ) : waitlistQuery.isError ? (
        <ErrorBanner message={getErrorMessage(waitlistQuery.error, 'Failed to load waitlist.')} />
      ) : waitlist.length === 0 ? (
        <SharedEmptyState
          message="No patients are currently on the waitlist."
          title="No Waitlist Entries"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="pb-3 pr-4 font-medium">Patient</th>
                <th className="pb-3 pr-4 font-medium">Doctor</th>
                <th className="pb-3 pr-4 font-medium">Requested</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Added</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedWaitlist.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-4 pr-4 font-medium text-slate-900">{item.patient_name}</td>
                  <td className="py-4 pr-4 text-slate-600">{item.doctor_name}</td>
                  <td className="py-4 pr-4 text-slate-600">{formatDate(item.requested_date)}</td>
                  <td className="py-4 pr-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="py-4 pr-4 text-slate-600">{formatDate(item.added_at)}</td>
                  <td className="py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-xl bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100"
                        onClick={() => waitlistStatusMutation.mutate({ id: item.id, status: 'offered' })}
                        type="button"
                      >
                        Offer Slot
                      </button>
                      <button
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                        onClick={() => waitlistStatusMutation.mutate({ id: item.id, status: 'expired' })}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={waitlistPage}
        totalPages={Math.max(1, Math.ceil(waitlistTotal / PAGE_SIZE))}
        onPageChange={setWaitlistPage}
      />

      <div className="mt-4">
        <ErrorBanner
          message={
            waitlistStatusMutation.isError
              ? getErrorMessage(waitlistStatusMutation.error, 'Unable to update waitlist.')
              : ''
          }
        />
      </div>
    </SectionShell>
  )

  const renderPatientSearch = () => (
    <SectionShell description="Search patient records and open their details instantly." title="Patient Search">
      <div className="space-y-6">
        <Field label="Search patient">
          <input
            className={inputClasses}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name or phone"
            type="text"
            value={searchTerm}
          />
        </Field>

        {patientsQuery.isLoading ? (
          <SharedLoadingSpinner size="md" />
        ) : patientsQuery.isError ? (
          <ErrorBanner message={getErrorMessage(patientsQuery.error, 'Failed to load patients.')} />
        ) : searchedPatients.length === 0 ? (
          <SharedEmptyState message="No patients found." title="No Patients" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Phone</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Gender</th>
                  <th className="pb-3 pr-4 font-medium">DOB</th>
                  <th className="pb-3 pr-4 font-medium">Created</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPatients.map((patient) => (
                  <tr key={patient.id} className="border-b border-slate-100">
                    <td className="py-4 pr-4 font-medium text-slate-900">{patient.full_name}</td>
                    <td className="py-4 pr-4 text-slate-600">{patient.phone || 'N/A'}</td>
                    <td className="py-4 pr-4 text-slate-600">{patient.email || 'N/A'}</td>
                    <td className="py-4 pr-4 text-slate-600">{patient.gender || 'N/A'}</td>
                    <td className="py-4 pr-4 text-slate-600">{formatDate(patient.date_of_birth)}</td>
                    <td className="py-4 pr-4 text-slate-600">{formatDate(patient.created_at)}</td>
                    <td className="py-4">
                      <button
                        className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-700"
                        onClick={() => {
                          setSelectedPatient(patient)
                          patientEditFormState.reset({
                            full_name: patient.full_name || '',
                            phone: patient.phone || '',
                            email: patient.email || '',
                            gender: patient.gender || '',
                            date_of_birth: patient.date_of_birth || '',
                            allergies: patient.allergies || '',
                            medical_notes: patient.medical_notes || '',
                          })
                        }}
                        type="button"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={patientsPage}
          totalPages={Math.max(1, Math.ceil(patientsTotal / PAGE_SIZE))}
          onPageChange={setPatientsPage}
        />
      </div>
    </SectionShell>
  )

  const renderSettings = () => (
    <div className="grid gap-6 lg:max-w-2xl lg:grid-cols-2">
      <div className={`${cardClasses} p-6`}>
        <h3 className="text-lg font-semibold text-slate-900">Account</h3>
        <p className="mt-4 text-sm text-slate-500">Logged in as</p>
        <p className="mt-1 text-base font-medium text-slate-900">{receptionistEmail}</p>
        <p className="mt-4 text-sm text-slate-500">Role</p>
        <p className="mt-1 text-base font-medium text-slate-900">Receptionist</p>
      </div>
      <div className={`${cardClasses} p-6`}>
        <h3 className="text-lg font-semibold text-slate-900">Session</h3>
        <p className="mt-4 text-sm text-slate-600">Use logout when your shift ends.</p>
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
    checkin: renderCheckInBoard(),
    book: renderQuickBook(),
    waitlist: renderWaitlist(),
    search: renderPatientSearch(),
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
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-teal-300">Clinic CRM</p>
            <p className="mt-2 text-sm text-slate-400">Reception workspace</p>
          </div>
          <nav className="flex-1 space-y-2 px-4 py-6">
            {NAV_ITEMS.map((item) => {
              const isActive = item.key === activeSection
              return (
                <button
                  key={item.key}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    isActive
                      ? 'bg-teal-500/15 text-teal-300 ring-1 ring-inset ring-teal-400/40'
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
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-600">Reception</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-900">{pageTitle}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 sm:block">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Signed in</p>
                <p className="text-sm font-medium text-slate-800">{receptionistEmail}</p>
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

      <Modal
        maxWidth="max-w-2xl"
        onClose={() => {
          setCheckInReschedule(null)
          setRescheduleForm({ date: today, time: '' })
        }}
        open={Boolean(checkInReschedule)}
        title="Reschedule Appointment"
      >
        <div className="space-y-5">
          {checkInReschedule ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">{checkInReschedule.patient_name}</p>
              <p className="mt-1">
                {checkInReschedule.doctor_name} • {formatDateTime(checkInReschedule.date_time)}
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="New date">
              <input
                className={inputClasses}
                onChange={(event) =>
                  setRescheduleForm((current) => ({
                    ...current,
                    date: event.target.value,
                    time: '',
                  }))
                }
                type="date"
                value={rescheduleForm.date}
              />
            </Field>
            <Field label="Available slot">
              <select
                className={inputClasses}
                onChange={(event) =>
                  setRescheduleForm((current) => ({
                    ...current,
                    time: event.target.value,
                  }))
                }
                value={rescheduleForm.time}
              >
                <option value="">Select slot</option>
                {(rescheduleSlotsQuery.data || []).map((slot, index) => {
                  const value = typeof slot === 'string' ? slot : firstValue(slot.value, slot.time, '')
                  return (
                    <option key={value || index} value={value}>
                      {formatTime(value)}
                    </option>
                  )
                })}
              </select>
            </Field>
          </div>

          {rescheduleSlotsQuery.isLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}
          {rescheduleSlotsQuery.isError ? (
            <ErrorBanner
              message={getErrorMessage(rescheduleSlotsQuery.error, 'Failed to load available slots.')}
            />
          ) : null}
          {rescheduleMutation.isError ? (
            <ErrorBanner
              message={getErrorMessage(rescheduleMutation.error, 'Unable to reschedule appointment.')}
            />
          ) : null}

          <div className="flex justify-end gap-3">
            <button
              className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={() => {
                setCheckInReschedule(null)
                setRescheduleForm({ date: today, time: '' })
              }}
              type="button"
            >
              Close
            </button>
            <button
              className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={rescheduleMutation.isPending || !checkInReschedule?.id || !rescheduleForm.time}
              onClick={() =>
                rescheduleMutation.mutate({
                  id: checkInReschedule.id,
                  status: 'confirmed',
                  scheduled_at: combineDateAndTime(rescheduleForm.date, rescheduleForm.time),
                })
              }
              type="button"
            >
              {rescheduleMutation.isPending ? 'Saving...' : 'Save Reschedule'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        maxWidth="max-w-3xl"
            onClose={() => {
              setWaitlistModalOpen(false)
              waitlistFormState.reset({ ...WAITLIST_FORM_INITIAL_VALUES, preferred_date: today })
            }}
        open={waitlistModalOpen}
        title="Add to Waitlist"
      >
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Patient Lookup</p>
            <Field label="Patient phone">
              <input
                className={getInputStateClasses(waitlistFormState.errors.phone)}
                name="phone"
                onBlur={waitlistFormState.handleBlur}
                onChange={(event) =>
                  setWaitlistForm((current) => ({
                    ...current,
                    phone: event.target.value,
                    patient_id: '',
                    full_name: '',
                    email: '',
                    gender: '',
                    date_of_birth: '',
                    allergies: '',
                    medical_notes: '',
                  }))
                }
                placeholder="0300 0000000"
                type="text"
                value={waitlistForm.phone}
              />
              {waitlistFormState.errors.phone ? (
                <p className="mt-1 text-sm text-red-500">{waitlistFormState.errors.phone}</p>
              ) : null}
            </Field>

            {waitlistLookupQuery.isLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading...</p>
            ) : waitlistLookupPatient || waitlistForm.patient_id ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Patient ready: {waitlistBookingPatient.full_name}
              </div>
            ) : waitlistForm.phone.trim().length >= 5 &&
              (!waitlistLookupQuery.isError || isNotFoundError(waitlistLookupQuery.error)) ? (
              <div className="mt-4 space-y-4">
                <p className="text-sm font-medium text-slate-700">New Patient</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Full name">
                    <input
                      className={getInputStateClasses(waitlistFormState.errors.full_name)}
                      name="full_name"
                      onBlur={waitlistFormState.handleBlur}
                      onChange={(event) =>
                        setWaitlistForm((current) => ({
                          ...current,
                          full_name: event.target.value,
                        }))
                      }
                      type="text"
                      value={waitlistForm.full_name}
                    />
                    {waitlistFormState.errors.full_name ? (
                      <p className="mt-1 text-sm text-red-500">{waitlistFormState.errors.full_name}</p>
                    ) : null}
                  </Field>
                  <Field label="Email">
                    <input
                      className={getInputStateClasses(waitlistFormState.errors.email)}
                      name="email"
                      onBlur={waitlistFormState.handleBlur}
                      onChange={(event) =>
                        setWaitlistForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      type="email"
                      value={waitlistForm.email}
                    />
                    {waitlistFormState.errors.email ? (
                      <p className="mt-1 text-sm text-red-500">{waitlistFormState.errors.email}</p>
                    ) : null}
                  </Field>
                  <Field label="Gender">
                    <select
                      className={inputClasses}
                      onChange={(event) =>
                        setWaitlistForm((current) => ({
                          ...current,
                          gender: event.target.value,
                        }))
                      }
                      value={waitlistForm.gender}
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>
                  <Field label="Date of birth">
                    <input
                      className={inputClasses}
                      onChange={(event) =>
                        setWaitlistForm((current) => ({
                          ...current,
                          date_of_birth: event.target.value,
                        }))
                      }
                      type="date"
                      value={waitlistForm.date_of_birth}
                    />
                  </Field>
                  <Field label="Allergies (optional)">
                    <textarea
                      className={inputClasses}
                      onChange={(event) =>
                        setWaitlistForm((current) => ({
                          ...current,
                          allergies: event.target.value,
                        }))
                      }
                      rows="3"
                      value={waitlistForm.allergies}
                    />
                  </Field>
                  <Field label="Medical notes (optional)">
                    <textarea
                      className={inputClasses}
                      onChange={(event) =>
                        setWaitlistForm((current) => ({
                          ...current,
                          medical_notes: event.target.value,
                        }))
                      }
                      rows="3"
                      value={waitlistForm.medical_notes}
                    />
                  </Field>
                </div>

                <div className="flex justify-end">
                  <button
                    className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={
                      createPatientMutation.isPending ||
                      !waitlistFormState.isValid ||
                      !waitlistForm.full_name ||
                      !waitlistForm.phone ||
                      !waitlistForm.gender ||
                      !waitlistForm.date_of_birth
                    }
                    onClick={async () => {
                      if (!waitlistFormState.validateAll()) {
                        return
                      }

                      const created = await createPatientMutation.mutateAsync({
                        full_name: waitlistForm.full_name,
                        phone: waitlistForm.phone,
                        email: waitlistForm.email,
                        gender: waitlistForm.gender,
                        date_of_birth: waitlistForm.date_of_birth,
                        allergies: waitlistForm.allergies || undefined,
                        medical_notes: waitlistForm.medical_notes || undefined,
                      })

                      setWaitlistForm((current) => ({
                        ...current,
                        patient_id: created.id,
                        full_name: created.full_name,
                        email: created.email,
                        gender: created.gender,
                        date_of_birth: created.date_of_birth,
                        allergies: created.allergies || '',
                        medical_notes: created.medical_notes || '',
                      }))
                    }}
                    type="button"
                  >
                    {createPatientMutation.isPending ? 'Creating...' : 'Create Patient'}
                  </button>
                </div>
              </div>
            ) : null}

            {waitlistLookupQuery.isError && !isNotFoundError(waitlistLookupQuery.error) ? (
              <div className="mt-4">
                <ErrorBanner
                  message={getErrorMessage(waitlistLookupQuery.error, 'Unable to look up patient.')}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Doctor">
              <select
                className={inputClasses}
                onChange={(event) =>
                  setWaitlistForm((current) => ({
                    ...current,
                    doctor_id: event.target.value,
                  }))
                }
                value={waitlistForm.doctor_id}
              >
                <option value="">Select doctor</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Preferred date">
              <input
                className={inputClasses}
                onChange={(event) =>
                  setWaitlistForm((current) => ({
                    ...current,
                    preferred_date: event.target.value,
                  }))
                }
                type="date"
                value={waitlistForm.preferred_date}
              />
            </Field>
          </div>

          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-900">
            Patient: {waitlistBookingPatient?.full_name || 'Select or create a patient first'}
          </div>

          {createWaitlistMutation.isError ? (
            <ErrorBanner
              message={getErrorMessage(createWaitlistMutation.error, 'Unable to add patient to waitlist.')}
            />
          ) : null}

          {createPatientMutation.isError ? (
            <ErrorBanner
              message={getErrorMessage(createPatientMutation.error, 'Unable to create patient.')}
            />
          ) : null}

          <div className="flex justify-end gap-3">
            <button
              className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={() => {
                setWaitlistModalOpen(false)
                waitlistFormState.reset({ ...WAITLIST_FORM_INITIAL_VALUES, preferred_date: today })
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={
                createWaitlistMutation.isPending ||
                !waitlistBookingPatient?.id ||
                !waitlistForm.doctor_id ||
                !waitlistForm.preferred_date
              }
              onClick={() =>
                createWaitlistMutation.mutate({
                  patient_id: waitlistBookingPatient.id,
                  doctor_id: waitlistForm.doctor_id,
                  requested_date: waitlistForm.preferred_date,
                })
              }
              type="button"
            >
              {createWaitlistMutation.isPending ? 'Saving...' : 'Add to Waitlist'}
            </button>
          </div>
        </div>
      </Modal>

      <SlidingPanel
        onClose={() => setSelectedPatient(null)}
        open={Boolean(selectedPatient)}
        title={selectedPatient?.full_name || 'Patient Details'}
      >
        <div className="space-y-6">
          {selectedPatient ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <h4 className="text-lg font-semibold text-slate-900">Personal Info</h4>
              <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <p>
                  <span className="font-medium text-slate-900">Phone:</span> {selectedPatient.phone || 'N/A'}
                </p>
                <p>
                  <span className="font-medium text-slate-900">Email:</span> {selectedPatient.email || 'N/A'}
                </p>
                <p>
                  <span className="font-medium text-slate-900">Gender:</span> {selectedPatient.gender || 'N/A'}
                </p>
                <p>
                  <span className="font-medium text-slate-900">Date of birth:</span>{' '}
                  {formatDate(selectedPatient.date_of_birth)}
                </p>
                <p className="md:col-span-2">
                  <span className="font-medium text-slate-900">Allergies:</span>{' '}
                  {selectedPatient.allergies || 'None recorded'}
                </p>
                <p className="md:col-span-2">
                  <span className="font-medium text-slate-900">Medical notes:</span>{' '}
                  {selectedPatient.medical_notes || 'No notes yet'}
                </p>
                <p>
                  <span className="font-medium text-slate-900">Created:</span>{' '}
                  {formatDate(selectedPatient.created_at)}
                </p>
              </div>
            </div>
          ) : null}

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="text-lg font-semibold text-slate-900">Upcoming Appointments</h4>
            <div className="mt-4">
              {patientAppointmentsQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : patientAppointmentsQuery.isError ? (
                <ErrorBanner
                  message={getErrorMessage(
                    patientAppointmentsQuery.error,
                    'Failed to load patient appointments.',
                  )}
                />
              ) : patientAppointments.length === 0 ? (
                <EmptyState message="No appointments found for this patient." />
              ) : (
                <div className="space-y-3">
                  {patientAppointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{appointment.doctor_name}</p>
                          <p className="mt-1 text-slate-500">
                            {isToday(appointment.date_time)
                              ? `Today at ${formatTime(appointment.date_time)}`
                              : formatDateTime(appointment.date_time)}
                          </p>
                        </div>
                        <StatusBadge status={appointment.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="text-lg font-semibold text-slate-900">Edit Basic Info</h4>
            <div className="mt-4 grid gap-4">
              <Field label="Full name">
                <input
                  className={getInputStateClasses(patientEditFormState.errors.full_name)}
                  name="full_name"
                  onBlur={patientEditFormState.handleBlur}
                  onChange={patientEditFormState.handleChange}
                  type="text"
                  value={patientEditForm.full_name}
                />
                {patientEditFormState.errors.full_name ? (
                  <p className="mt-1 text-sm text-red-500">{patientEditFormState.errors.full_name}</p>
                ) : null}
              </Field>
              <Field label="Phone">
                <input
                  className={getInputStateClasses(patientEditFormState.errors.phone)}
                  name="phone"
                  onBlur={patientEditFormState.handleBlur}
                  onChange={patientEditFormState.handleChange}
                  type="text"
                  value={patientEditForm.phone}
                />
                {patientEditFormState.errors.phone ? (
                  <p className="mt-1 text-sm text-red-500">{patientEditFormState.errors.phone}</p>
                ) : null}
              </Field>
              <Field label="Email">
                <input
                  className={getInputStateClasses(patientEditFormState.errors.email)}
                  name="email"
                  onBlur={patientEditFormState.handleBlur}
                  onChange={patientEditFormState.handleChange}
                  type="email"
                  value={patientEditForm.email}
                />
                {patientEditFormState.errors.email ? (
                  <p className="mt-1 text-sm text-red-500">{patientEditFormState.errors.email}</p>
                ) : null}
              </Field>
              <Field label="Gender">
                <select
                  className={inputClasses}
                  name="gender"
                  onChange={patientEditFormState.handleChange}
                  value={patientEditForm.gender}
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Date of birth">
                <input
                  className={inputClasses}
                  name="date_of_birth"
                  onChange={patientEditFormState.handleChange}
                  type="date"
                  value={patientEditForm.date_of_birth}
                />
              </Field>
              <Field label="Allergies (optional)">
                <textarea
                  className={inputClasses}
                  name="allergies"
                  onChange={patientEditFormState.handleChange}
                  rows="3"
                  value={patientEditForm.allergies}
                />
              </Field>
              <Field label="Medical notes (optional)">
                <textarea
                  className={inputClasses}
                  name="medical_notes"
                  onChange={patientEditFormState.handleChange}
                  rows="3"
                  value={patientEditForm.medical_notes}
                />
              </Field>
            </div>

            {updatePatientMutation.isError ? (
              <div className="mt-4">
                <ErrorBanner
                  message={getErrorMessage(updatePatientMutation.error, 'Unable to update patient.')}
                />
              </div>
            ) : null}

            <div className="mt-6 flex justify-end">
              <button
                className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={
                  updatePatientMutation.isPending ||
                  !selectedPatient?.id ||
                  !patientEditFormState.isValid ||
                  !patientEditForm.full_name.trim() ||
                  !patientEditForm.phone.trim()
                }
                onClick={async () => {
                  if (!patientEditFormState.validateAll()) {
                    return
                  }

                  await updatePatientMutation.mutateAsync({
                    id: selectedPatient.id,
                    payload: patientEditForm,
                  })

                  setSelectedPatient((current) =>
                    current
                      ? {
                          ...current,
                          ...patientEditForm,
                        }
                      : current,
                  )
                }}
                type="button"
              >
                {updatePatientMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </SlidingPanel>
    </div>
  )
}

export default ReceptionistDashboard
