
import { useEffect, useMemo, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppointmentCalendar from '../components/AppointmentCalendar.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
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
} from '../lib/datetime.js'
import { coerceBoolean, normalizeDelimitedList, normalizeSlotOptions } from '../lib/clinicData.js'
import { useForm } from '../lib/useForm.js'
import { isEmail, isPhone, minLength, required } from '../lib/validators.js'
import { registerUser } from '../services/auth.js'
import { getDoctorFeedbackStats, getFeedback as fetchFeedback } from '../services/feedback.js'
import {
  createAppointment as createAppointmentService,
  getAppointments as fetchAppointments,
  getPatientAppointments as fetchPatientAppointments,
  getSlots as fetchSlots,
  updateAppointmentStatus,
} from '../services/appointments.js'
import {
  createDoctor as createDoctorService,
  deleteDoctor as deleteDoctorService,
  getDoctors as fetchDoctors,
  toggleDoctorStatus,
  updateDoctor as updateDoctorService,
} from '../services/doctors.js'
import {
  createPatient as createPatientService,
  getPatientByPhone as fetchPatientByPhone,
  getPatients as fetchPatients,
  updatePatient as updatePatientService,
} from '../services/patients.js'
import { getDoctorStats as fetchDoctorReports, getNoShowRate, getSummary } from '../services/reports.js'
import { createWaitlist, getWaitlist as fetchWaitlist, updateWaitlistStatus } from '../services/waitlist.js'

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { key: 'appointments', label: 'Appointments', icon: '📅' },
  { key: 'patients', label: 'Patients', icon: '👥' },
  { key: 'doctors', label: 'Doctors', icon: '🩺' },
  { key: 'waitlist', label: 'Waitlist', icon: '⏳' },
  { key: 'feedback', label: 'Feedback', icon: '⭐' },
  { key: 'reports', label: 'Reports', icon: '📊' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
]

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const APPOINTMENT_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' },
  { value: 'pending', label: 'Pending' },
]

const STATUS_STYLES = {
  confirmed: 'bg-sky-100 text-sky-700 ring-sky-200',
  completed: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-rose-100 text-rose-700 ring-rose-200',
  no_show: 'bg-orange-100 text-orange-700 ring-orange-200',
  pending: 'bg-amber-100 text-amber-800 ring-amber-200',
  offered: 'bg-cyan-100 text-cyan-700 ring-cyan-200',
  active: 'bg-violet-100 text-violet-700 ring-violet-200',
  inactive: 'bg-slate-200 text-slate-700 ring-slate-300',
  expired: 'bg-slate-200 text-slate-700 ring-slate-300',
}

const inputClasses =
  'mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100'

const cardClasses = 'rounded-3xl border border-slate-200 bg-white shadow-sm'
const EMPTY_ARRAY = []
const PAGE_SIZE = 10
const PATIENT_FORM_INITIAL_VALUES = {
  full_name: '',
  phone: '',
  email: '',
  password: '',
  date_of_birth: '',
  gender: '',
  blood_group: '',
  allergies: '',
  medical_notes: '',
}
const PATIENT_EDIT_FORM_INITIAL_VALUES = {
  full_name: '',
  phone: '',
  email: '',
  date_of_birth: '',
  gender: '',
  blood_group: '',
  allergies: '',
  medical_notes: '',
}
const DOCTOR_FORM_INITIAL_VALUES = {
  full_name: '',
  specialty: '',
  email: '',
  password: '',
  phone: '',
  working_days: [],
  start_time: '',
  end_time: '',
  slot_duration_mins: 15,
  consultation_duration_mins: 15,
  accepting_patients: true,
}
const PATIENT_CREATE_VALIDATION_RULES = {
  full_name: [required, (value) => minLength(value, 2)],
  phone: [required, isPhone],
  email: [isEmail],
  password: [required, (value) => minLength(value, 8)],
}
const PATIENT_EDIT_VALIDATION_RULES = {
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

const normalizeDoctor = (doctor = {}) => ({
  id: firstValue(doctor.id, doctor._id, doctor.doctor_id, doctor.email, ''),
  full_name: firstValue(doctor.full_name, doctor.name, 'Unnamed doctor'),
  specialty: firstValue(doctor.specialty, doctor.specialisation, 'General'),
  email: firstValue(doctor.email, ''),
  phone: firstValue(doctor.phone, ''),
  working_days: normalizeDelimitedList(firstValue(doctor.working_days, doctor.workingDays)),
  start_time: firstValue(doctor.start_time, doctor.startTime, ''),
  end_time: firstValue(doctor.end_time, doctor.endTime, ''),
  slot_duration_mins: Number(
    firstValue(doctor.slot_duration_mins, doctor.slotDurationMins, 15),
  ),
  consultation_duration_mins: Number(
    firstValue(
      doctor.consultation_duration_mins,
      doctor.consultationDurationMins,
      doctor.consultation_duration,
      doctor.consultationDuration,
      doctor.slot_duration_mins,
      doctor.slotDurationMins,
      15,
    ),
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
  is_active: coerceBoolean(
    firstValue(doctor.is_active, doctor.active, doctor.status === 'active', true),
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
  source: firstValue(appointment.source, appointment.booking_source, 'N/A'),
})

const normalizePatient = (patient = {}) => ({
  id: firstValue(patient.id, patient._id, patient.patient_id, ''),
  full_name: firstValue(patient.full_name, patient.name, 'Unnamed patient'),
  phone: firstValue(patient.phone, ''),
  email: firstValue(patient.email, ''),
  date_of_birth: firstValue(patient.date_of_birth, patient.dob, ''),
  gender: firstValue(patient.gender, ''),
  blood_group: firstValue(patient.blood_group, patient.bloodGroup, ''),
  allergies: firstValue(patient.allergies, ''),
  medical_notes: firstValue(patient.medical_notes, patient.notes, ''),
  created_at: firstValue(patient.created_at, patient.createdAt, ''),
})

const normalizeWaitlist = (entry = {}) => ({
  id: firstValue(entry.id, entry._id, entry.waitlist_id, ''),
  patient_name: firstValue(
    entry.patient_name,
    entry.patient?.full_name,
    entry.patient?.name,
    'Unknown patient',
  ),
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

const normalizeFeedback = (item = {}) => ({
  id: firstValue(item.id, item._id, item.feedback_id, ''),
  patient_name: firstValue(
    item.patient_name,
    item.patient?.full_name,
    item.patient?.name,
    'Unknown patient',
  ),
  doctor_name: firstValue(
    item.doctor_name,
    item.doctor?.full_name,
    item.doctor?.name,
    'Unknown doctor',
  ),
  rating: Number(firstValue(item.rating, 0)),
  comment: firstValue(item.comment, 'No comment provided'),
  date: firstValue(item.date, item.created_at, item.createdAt, ''),
})

const getDoctors = (payload) =>
  ensureArray(payload, ['doctors', 'data']).map(normalizeDoctor)

const getAppointments = (payload) =>
  ensureArray(payload, ['appointments', 'data']).map(normalizeAppointment)

const getPatients = (payload) =>
  ensureArray(payload, ['patients', 'data']).map(normalizePatient)

const getWaitlist = (payload) =>
  ensureArray(payload, ['waitlist', 'data']).map(normalizeWaitlist)

const getFeedback = (payload) =>
  ensureArray(payload, ['feedback', 'data']).map(normalizeFeedback)

const getDoctorStats = (payload) => ensureArray(payload, ['data', 'stats', 'doctors'])

const getAverageRating = (stats) => {
  if (!stats.length) return '0.0'

  const values = stats
    .map((item) => Number(firstValue(item.average_rating, item.avg_rating, item.rating, 0)))
    .filter((value) => !Number.isNaN(value))

  if (!values.length) return '0.0'

  const total = values.reduce((sum, value) => sum + value, 0)
  return (total / values.length).toFixed(1)
}

const getErrorMessage = (error, fallback = 'Something went wrong.') =>
  firstValue(
    error?.response?.data?.message,
    error?.response?.data?.error,
    error?.message,
    fallback,
  )

const getPageTitle = (key) =>
  NAV_ITEMS.find((item) => item.key === key)?.label || 'Dashboard'

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

function Stars({ rating }) {
  return (
    <div className="flex items-center gap-1 text-sm text-amber-500">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index}>{index < rating ? '★' : '☆'}</span>
      ))}
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
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
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

function MetricCard({ label, value, accent = 'bg-cyan-50 text-cyan-700' }) {
  return (
    <div className={`${cardClasses} p-6`}>
      <div
        className={`inline-flex rounded-2xl px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${accent}`}
      >
        {label}
      </div>
      <p className="mt-5 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
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

function SlidingPanel({ open, title, onClose, children }) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/40 transition ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        role="presentation"
      />
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-xl transform overflow-y-auto bg-white shadow-2xl transition duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </aside>
    </>
  )
}

function AdminDashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const today = getSydneyToday()
  const storedUser = getStoredUser()
  const adminEmail = firstValue(storedUser?.email, 'admin@cliniccrm.com')

  const [activeSection, setActiveSection] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [appointmentsFilters, setAppointmentsFilters] = useState({
    date: today,
    doctor_id: '',
    status: '',
  })
  const [appointmentsPage, setAppointmentsPage] = useState(1)
  const [patientSearch, setPatientSearch] = useState('')
  const [patientsPage, setPatientsPage] = useState(1)
  const [patientFilters, setPatientFilters] = useState({
    gender: '',
    blood_group: '',
  })
  const [doctorFilters, setDoctorFilters] = useState({
    search: '',
    specialty: '',
    status: '',
    day: '',
  })
  const [doctorsPage, setDoctorsPage] = useState(1)
  const [waitlistFilters, setWaitlistFilters] = useState({
    doctor_id: '',
    status: '',
    requested_date: '',
  })
  const [waitlistPage, setWaitlistPage] = useState(1)
  const [feedbackFilters, setFeedbackFilters] = useState({
    doctor: '',
    rating: '',
    search: '',
  })
  const [feedbackPage, setFeedbackPage] = useState(1)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false)
  const [addPatientOpen, setAddPatientOpen] = useState(false)
  const [doctorModal, setDoctorModal] = useState({ open: false, doctor: null })
  const [doctorDeleteTarget, setDoctorDeleteTarget] = useState(null)
  const [waitlistModalOpen, setWaitlistModalOpen] = useState(false)
  const [appointmentForm, setAppointmentForm] = useState({
    phone: '',
    patient_id: '',
    patient_name: '',
    doctor_id: '',
    date: today,
    time: '',
  })
  const [receptionistForm, setReceptionistForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
  })
  const [waitlistForm, setWaitlistForm] = useState({
    phone: '',
    patient_id: '',
    patient_name: '',
    doctor_id: '',
    requested_date: today,
  })
  const doctorValidationRules = {
    full_name: [required, (value) => minLength(value, 2)],
    specialty: [required],
    email: [required, isEmail],
    phone: [required, isPhone],
    password: doctorModal.doctor
      ? [(value) => minLength(value, 8)]
      : [required, (value) => minLength(value, 8)],
  }
  const patientFormState = useForm(PATIENT_FORM_INITIAL_VALUES, PATIENT_CREATE_VALIDATION_RULES)
  const patientEditFormState = useForm(PATIENT_EDIT_FORM_INITIAL_VALUES, PATIENT_EDIT_VALIDATION_RULES)
  const doctorFormState = useForm(DOCTOR_FORM_INITIAL_VALUES, doctorValidationRules)
  const patientForm = patientFormState.values
  const patientEditForm = patientEditFormState.values
  const doctorForm = doctorFormState.values
  const setDoctorForm = (updater) => {
    const nextValues =
      typeof updater === 'function' ? updater(doctorFormState.values) : updater
    doctorFormState.setValues(nextValues)
  }

  const dailyReportQuery = useQuery({
    queryKey: ['reports', 'daily'],
    queryFn: () => getSummary(today),
  })

  const doctorsQuery = useQuery({
    queryKey: ['doctors'],
    queryFn: async () => getDoctors(await fetchDoctors()),
  })

  const feedbackStatsQuery = useQuery({
    queryKey: ['feedback', 'stats', 'doctors'],
    queryFn: async () => getDoctorStats(await getDoctorFeedbackStats()),
  })

  const recentAppointmentsQuery = useQuery({
    queryKey: ['appointments', 'recent'],
    queryFn: async () => getAppointments(await fetchAppointments()).slice(0, 5),
  })

  const appointmentsQuery = useQuery({
    queryKey: ['appointments', appointmentsFilters, appointmentsPage],
    queryFn: () =>
      fetchAppointments({
        date: appointmentsFilters.date || undefined,
        doctor_id: appointmentsFilters.doctor_id || undefined,
        status: appointmentsFilters.status || undefined,
        page: appointmentsPage,
      }),
    enabled: activeSection === 'appointments',
  })

  const patientsQuery = useQuery({
    queryKey: ['patients', patientSearch, patientsPage],
    queryFn: () => fetchPatients(patientsPage, patientSearch),
    enabled: activeSection === 'patients',
  })

  const patientHistoryQuery = useQuery({
    queryKey: ['appointments', 'patient', selectedPatient?.id],
    queryFn: async () => getAppointments(await fetchPatientAppointments(selectedPatient.id)),
    enabled: Boolean(selectedPatient?.id),
  })

  const waitlistQuery = useQuery({
    queryKey: ['waitlist', waitlistPage],
    queryFn: () => fetchWaitlist({ page: waitlistPage }),
    enabled: activeSection === 'waitlist',
  })

  const feedbackQuery = useQuery({
    queryKey: ['feedback'],
    queryFn: async () => getFeedback(await fetchFeedback()),
    enabled: activeSection === 'feedback',
  })

  const noShowRateQuery = useQuery({
    queryKey: ['reports', 'no-show-rate'],
    queryFn: () => getNoShowRate(),
    enabled: activeSection === 'reports',
  })

  const doctorReportsQuery = useQuery({
    queryKey: ['reports', 'doctors'],
    queryFn: async () => ensureArray(await fetchDoctorReports(), ['data', 'doctors', 'reports']),
    enabled: activeSection === 'reports',
  })

  const patientLookupQuery = useQuery({
    queryKey: ['patients', 'phone', appointmentForm.phone],
    queryFn: async () => normalizePatient(await fetchPatientByPhone(appointmentForm.phone)),
    enabled: newAppointmentOpen && appointmentForm.phone.trim().length >= 5,
    retry: false,
  })

  const waitlistPatientLookupQuery = useQuery({
    queryKey: ['waitlist', 'patient-phone', waitlistForm.phone],
    queryFn: async () => normalizePatient(await fetchPatientByPhone(waitlistForm.phone)),
    enabled: waitlistModalOpen && waitlistForm.phone.trim().length >= 5,
    retry: false,
  })

  const slotsQuery = useQuery({
    queryKey: ['appointments', 'slots', appointmentForm.doctor_id, appointmentForm.date],
    queryFn: async () =>
      normalizeSlotOptions(await fetchSlots(appointmentForm.doctor_id, appointmentForm.date)),
    enabled: newAppointmentOpen && Boolean(appointmentForm.doctor_id && appointmentForm.date),
  })

  const invalidateCoreData = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['appointments'] }),
      queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
      queryClient.invalidateQueries({ queryKey: ['patients'] }),
      queryClient.invalidateQueries({ queryKey: ['doctors'] }),
      queryClient.invalidateQueries({ queryKey: ['feedback'] }),
      queryClient.invalidateQueries({ queryKey: ['reports'] }),
    ])

  const appointmentStatusMutation = useMutation({
    mutationFn: ({ id, status }) => updateAppointmentStatus(id, status),
    onSuccess: invalidateCoreData,
  })

  const createAppointmentMutation = useMutation({
    mutationFn: createAppointmentService,
    onSuccess: async () => {
      await invalidateCoreData()
      setNewAppointmentOpen(false)
      setAppointmentForm({
        phone: '',
        patient_id: '',
        patient_name: '',
        doctor_id: '',
        date: today,
        time: '',
      })
    },
  })

  const createPatientMutation = useMutation({
    mutationFn: createPatientService,
    onSuccess: async () => {
      await invalidateCoreData()
      setAddPatientOpen(false)
      patientFormState.reset(PATIENT_FORM_INITIAL_VALUES)
    },
  })

  const updatePatientMutation = useMutation({
    mutationFn: ({ id, payload }) => updatePatientService(id, payload),
    onSuccess: async () => {
      await invalidateCoreData()
      if (selectedPatient?.id) {
        await queryClient.invalidateQueries({
          queryKey: ['appointments', 'patient', selectedPatient.id],
        })
      }
    },
  })

  const createDoctorMutation = useMutation({
    mutationFn: createDoctorService,
    onSuccess: async () => {
      await invalidateCoreData()
      setDoctorModal({ open: false, doctor: null })
      doctorFormState.reset(DOCTOR_FORM_INITIAL_VALUES)
    },
  })

  const createReceptionistMutation = useMutation({
    mutationFn: (payload) => registerUser({ ...payload, role: 'receptionist' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      setReceptionistForm({
        full_name: '',
        email: '',
        password: '',
        phone: '',
      })
    },
  })

  const updateDoctorMutation = useMutation({
    mutationFn: ({ id, payload }) => updateDoctorService(id, payload),
    onSuccess: async () => {
      await invalidateCoreData()
      setDoctorModal({ open: false, doctor: null })
      doctorFormState.reset(DOCTOR_FORM_INITIAL_VALUES)
    },
  })

  const toggleDoctorMutation = useMutation({
    mutationFn: async ({ id, is_active }) => {
      await toggleDoctorStatus(id, is_active)
      return { id, is_active }
    },
    onSuccess: async ({ id, is_active }) => {
      queryClient.setQueryData(['doctors'], (current) =>
        (current || EMPTY_ARRAY).map((doctor) =>
          String(doctor.id) === String(id)
            ? { ...doctor, is_active }
            : doctor,
        ),
      )

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ])
    },
  })

  const deleteDoctorMutation = useMutation({
    mutationFn: async (id) => {
      await deleteDoctorService(id)
      return id
    },
    onSuccess: async (id) => {
      queryClient.setQueryData(['doctors'], (current) =>
        (current || EMPTY_ARRAY).filter((doctor) => String(doctor.id) !== String(id)),
      )

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ])
    },
  })

  const updateWaitlistStatusMutation = useMutation({
    mutationFn: ({ id, status }) => updateWaitlistStatus(id, status),
    onSuccess: invalidateCoreData,
  })

  const createWaitlistMutation = useMutation({
    mutationFn: createWaitlist,
    onSuccess: async () => {
      await invalidateCoreData()
      setWaitlistModalOpen(false)
      setWaitlistForm({
        phone: '',
        patient_id: '',
        patient_name: '',
        doctor_id: '',
        requested_date: today,
      })
    },
  })

  const doctors = doctorsQuery.data || EMPTY_ARRAY
  const recentAppointments = recentAppointmentsQuery.data || EMPTY_ARRAY
  const appointmentsPayload = appointmentsQuery.data || EMPTY_ARRAY
  const patientsPayload = patientsQuery.data || EMPTY_ARRAY
  const waitlistPayload = waitlistQuery.data || EMPTY_ARRAY
  const feedbackEntries = feedbackQuery.data || EMPTY_ARRAY
  const appointments = getAppointments(appointmentsPayload)
  const patients = getPatients(patientsPayload)
  const waitlist = getWaitlist(waitlistPayload)
  const patientHistory = patientHistoryQuery.data || EMPTY_ARRAY
  const feedbackStats = feedbackStatsQuery.data || EMPTY_ARRAY
  const averageRating = getAverageRating(feedbackStats)
  const dailyReport = dailyReportQuery.data || {}
  const pageTitle = getPageTitle(activeSection)
  const appointmentLookupPatient = patientLookupQuery.data || null
  const waitlistLookupPatient = waitlistPatientLookupQuery.data || null
  const appointmentsTotal = getTotalCount(appointmentsPayload, appointments.length)
  const patientsTotal = getTotalCount(patientsPayload, patients.length)

  const todaySummary = {
    totalAppointments: firstValue(
      dailyReport?.data?.appointments?.total,
      dailyReport?.appointments?.total,
      dailyReport?.totalAppointments,
      0,
    ),
    noShows: firstValue(
      dailyReport?.data?.appointments?.no_show,
      dailyReport?.appointments?.no_show,
      dailyReport?.no_show,
      0,
    ),
    activeWaitlist: firstValue(
      dailyReport?.data?.waitlist?.active,
      dailyReport?.waitlist?.active,
      0,
    ),
  }

  const reportRows = doctorReportsQuery.data || []
  const noShowRate = {
    percentage: firstValue(
      noShowRateQuery.data?.percentage,
      noShowRateQuery.data?.rate,
      noShowRateQuery.data?.no_show_rate,
      0,
    ),
    total: firstValue(noShowRateQuery.data?.total, noShowRateQuery.data?.count, 0),
  }

  const selectedDoctorName = useMemo(
    () =>
      doctors.find((doctor) => String(doctor.id) === String(appointmentForm.doctor_id))
        ?.full_name || '',
    [appointmentForm.doctor_id, doctors],
  )

  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const matchesGender =
        !patientFilters.gender ||
        String(patient.gender || '').toLowerCase() === patientFilters.gender.toLowerCase()
      const matchesBloodGroup =
        !patientFilters.blood_group ||
        String(patient.blood_group || '').toLowerCase() ===
          patientFilters.blood_group.toLowerCase()

      return matchesGender && matchesBloodGroup
    })
  }, [patientFilters.blood_group, patientFilters.gender, patients])

  const filteredDoctors = useMemo(() => {
    return doctors.filter((doctor) => {
      const needle = doctorFilters.search.trim().toLowerCase()
      const matchesSearch =
        !needle ||
        doctor.full_name.toLowerCase().includes(needle) ||
        doctor.specialty.toLowerCase().includes(needle) ||
        String(doctor.email || '').toLowerCase().includes(needle)
      const matchesSpecialty =
        !doctorFilters.specialty ||
        doctor.specialty.toLowerCase() === doctorFilters.specialty.toLowerCase()
      const matchesStatus =
        !doctorFilters.status ||
        (doctorFilters.status === 'active' && doctor.is_active) ||
        (doctorFilters.status === 'inactive' && !doctor.is_active)
      const matchesDay =
        !doctorFilters.day || doctor.working_days.includes(doctorFilters.day)

      return matchesSearch && matchesSpecialty && matchesStatus && matchesDay
    })
  }, [doctorFilters.day, doctorFilters.search, doctorFilters.specialty, doctorFilters.status, doctors])

  const filteredWaitlist = useMemo(() => {
    return waitlist.filter((item) => {
      const matchesDoctor =
        !waitlistFilters.doctor_id ||
        String(item.doctor_id) === String(waitlistFilters.doctor_id)
      const matchesStatus =
        !waitlistFilters.status || String(item.status) === String(waitlistFilters.status)
      const matchesDate =
        !waitlistFilters.requested_date ||
        String(item.requested_date || '').slice(0, 10) === waitlistFilters.requested_date

      return matchesDoctor && matchesStatus && matchesDate
    })
  }, [waitlist, waitlistFilters.doctor_id, waitlistFilters.requested_date, waitlistFilters.status])

  const filteredFeedbackEntries = useMemo(() => {
    return feedbackEntries.filter((item) => {
      const needle = feedbackFilters.search.trim().toLowerCase()
      const matchesDoctor =
        !feedbackFilters.doctor || item.doctor_name === feedbackFilters.doctor
      const matchesRating =
        !feedbackFilters.rating || Number(item.rating) === Number(feedbackFilters.rating)
      const matchesSearch =
        !needle ||
        item.patient_name.toLowerCase().includes(needle) ||
        item.doctor_name.toLowerCase().includes(needle) ||
        String(item.comment || '').toLowerCase().includes(needle)

      return matchesDoctor && matchesRating && matchesSearch
    })
  }, [feedbackEntries, feedbackFilters.doctor, feedbackFilters.rating, feedbackFilters.search])

  const doctorSpecialties = useMemo(
    () => [...new Set(doctors.map((doctor) => doctor.specialty).filter(Boolean))].sort(),
    [doctors],
  )

  const patientBloodGroups = useMemo(
    () => [...new Set(patients.map((patient) => patient.blood_group).filter(Boolean))].sort(),
    [patients],
  )

  const feedbackDoctorNames = useMemo(
    () => [...new Set(feedbackEntries.map((item) => item.doctor_name).filter(Boolean))].sort(),
    [feedbackEntries],
  )

  const paginatedAppointments = appointments
  const paginatedPatients = filteredPatients
  const paginatedDoctors = useMemo(
    () => filteredDoctors.slice((doctorsPage - 1) * PAGE_SIZE, doctorsPage * PAGE_SIZE),
    [doctorsPage, filteredDoctors],
  )
  const paginatedWaitlist = filteredWaitlist
  const paginatedFeedbackEntries = useMemo(
    () => filteredFeedbackEntries.slice((feedbackPage - 1) * PAGE_SIZE, feedbackPage * PAGE_SIZE),
    [feedbackPage, filteredFeedbackEntries],
  )

  function openDoctorModal(doctor = null) {
    doctorFormState.reset(
      doctor
        ? {
            full_name: doctor.full_name || '',
            specialty: doctor.specialty || '',
            email: doctor.email || '',
            password: '',
            phone: doctor.phone || '',
            working_days: doctor.working_days || [],
            start_time: doctor.start_time || '',
            end_time: doctor.end_time || '',
            slot_duration_mins: doctor.slot_duration_mins || 15,
            consultation_duration_mins: doctor.consultation_duration_mins || 15,
            accepting_patients: doctor.accepting_patients ?? true,
          }
        : {
            ...DOCTOR_FORM_INITIAL_VALUES,
          },
    )
    setDoctorModal({ open: true, doctor })
  }

  useEffect(() => {
    const section = searchParams.get('section')
    if (section) {
      setActiveSection(section)
    }
  }, [searchParams])

  useEffect(() => {
    const doctorId = searchParams.get('doctorId')
    const matchingDoctor = doctors.find((doctor) => String(doctor.id) === String(doctorId))

    if (matchingDoctor) {
      openDoctorModal(matchingDoctor)
      return
    }

    if (searchParams.get('openDoctor') === '1' && searchParams.get('section') === 'doctors' && doctorsQuery.isSuccess) {
      openDoctorModal()
    }
  }, [doctors, doctorsQuery.isSuccess, searchParams])

  useEffect(() => {
    const patientId = searchParams.get('patientId')
    if (!patientId) return

    const matchingPatient = patients.find((patient) => String(patient.id) === String(patientId))
    if (!matchingPatient) return

    setSelectedPatient(matchingPatient)
    patientEditFormState.reset({
      full_name: matchingPatient.full_name || '',
      phone: matchingPatient.phone || '',
      email: matchingPatient.email || '',
      date_of_birth: matchingPatient.date_of_birth || '',
      gender: matchingPatient.gender || '',
      blood_group: matchingPatient.blood_group || '',
      allergies: matchingPatient.allergies || '',
      medical_notes: matchingPatient.medical_notes || '',
    })
  }, [patients, searchParams])

  const handleLogout = () => {
    clearStoredAuth()
    navigate('/login', { replace: true })
  }

  const renderReceptionistUserForm = () => (
    <div className={`${cardClasses} p-6`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Receptionist Access</h3>
          <p className="mt-1 text-sm text-slate-600">
            Create front-desk accounts from here for the receptionist dashboard.
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          Role assigned automatically: <span className="font-semibold">receptionist</span>
        </div>
      </div>

      <form
        className="mt-6 grid gap-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          createReceptionistMutation.mutate(receptionistForm)
        }}
      >
        <Field label="Full name">
          <input
            className={inputClasses}
            onChange={(event) =>
              setReceptionistForm((current) => ({
                ...current,
                full_name: event.target.value,
              }))
            }
            placeholder="Reception team member"
            type="text"
            value={receptionistForm.full_name}
          />
        </Field>

        <Field label="Email">
          <input
            className={inputClasses}
            onChange={(event) =>
              setReceptionistForm((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            placeholder="reception@clinic.com"
            type="email"
            value={receptionistForm.email}
          />
        </Field>

        <Field label="Phone">
          <input
            className={inputClasses}
            onChange={(event) =>
              setReceptionistForm((current) => ({
                ...current,
                phone: event.target.value,
              }))
            }
            placeholder="0300 0000000"
            type="text"
            value={receptionistForm.phone}
          />
        </Field>

        <Field label="Temporary password">
          <input
            className={inputClasses}
            onChange={(event) =>
              setReceptionistForm((current) => ({
                ...current,
                password: event.target.value,
              }))
            }
            placeholder="Set initial password"
            type="password"
            value={receptionistForm.password}
          />
        </Field>

        <div className="md:col-span-2">
          {createReceptionistMutation.isSuccess ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {createReceptionistMutation.data?.existing
                ? 'Receptionist already exists. Existing account was recognized successfully.'
                : 'Receptionist account created successfully.'}
            </div>
          ) : null}

          <ErrorBanner
            message={
              createReceptionistMutation.isError
                ? getErrorMessage(
                    createReceptionistMutation.error,
                    'Unable to create receptionist user.',
                  )
                : ''
            }
          />

          <div className="mt-4 flex justify-end">
            <button
              className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={
                createReceptionistMutation.isPending ||
                !receptionistForm.full_name ||
                !receptionistForm.email ||
                !receptionistForm.password
              }
              type="submit"
            >
              {createReceptionistMutation.isPending ? 'Creating...' : 'Create Receptionist'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          accent="bg-cyan-50 text-cyan-700"
          label="Appointments Today"
          value={dailyReportQuery.isLoading ? 'Loading...' : todaySummary.totalAppointments}
        />
        <MetricCard
          accent="bg-orange-50 text-orange-700"
          label="No-Shows This Week"
          value={dailyReportQuery.isLoading ? 'Loading...' : todaySummary.noShows}
        />
        <MetricCard
          accent="bg-violet-50 text-violet-700"
          label="Active Waitlist"
          value={dailyReportQuery.isLoading ? 'Loading...' : todaySummary.activeWaitlist}
        />
        <MetricCard
          accent="bg-emerald-50 text-emerald-700"
          label="Average Rating"
          value={feedbackStatsQuery.isLoading ? 'Loading...' : averageRating}
        />
      </div>

      <ErrorBanner
        message={
          dailyReportQuery.isError
            ? getErrorMessage(dailyReportQuery.error, 'Failed to load dashboard metrics.')
            : feedbackStatsQuery.isError
              ? getErrorMessage(feedbackStatsQuery.error, 'Failed to load rating stats.')
              : ''
        }
      />

      <SectionShell
        description="The latest five bookings with current status and timing."
        title="Recent Appointments"
      >
        {recentAppointmentsQuery.isLoading ? (
          <SharedLoadingSpinner size="md" />
        ) : recentAppointmentsQuery.isError ? (
          <ErrorBanner
            message={getErrorMessage(recentAppointmentsQuery.error, 'Failed to load appointments.')}
          />
        ) : recentAppointments.length === 0 ? (
          <SharedEmptyState
            message="No recent appointments to show yet."
            title="No Recent Appointments"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Patient</th>
                  <th className="pb-3 pr-4 font-medium">Doctor</th>
                  <th className="pb-3 pr-4 font-medium">Time</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentAppointments.map((appointment) => (
                  <tr key={appointment.id} className="border-b border-slate-100">
                    <td className="py-4 pr-4 font-medium text-slate-900">
                      {appointment.patient_name}
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{appointment.doctor_name}</td>
                    <td className="py-4 pr-4 text-slate-600">
                      {formatDateTime(appointment.date_time)}
                    </td>
                    <td className="py-4">
                      <StatusBadge status={appointment.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Appointment Calendar</h2>
        <div className="mt-4">
          <AppointmentCalendar />
        </div>
      </section>

      {renderReceptionistUserForm()}
    </div>
  )

  const renderAppointments = () => (
    <SectionShell
      action={
        <button
          className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
          onClick={() => setNewAppointmentOpen(true)}
          type="button"
        >
          New Appointment
        </button>
      }
      description="Manage bookings, filter by date or physician, and update outcomes quickly."
      title="Appointments"
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Date">
            <input
              className={inputClasses}
              onChange={(event) =>
                setAppointmentsFilters((current) => ({
                  ...current,
                  date: event.target.value,
                }))
              }
              type="date"
              value={appointmentsFilters.date}
            />
          </Field>
          <Field label="Doctor">
            <select
              className={inputClasses}
              onChange={(event) =>
                setAppointmentsFilters((current) => ({
                  ...current,
                  doctor_id: event.target.value,
                }))
              }
              value={appointmentsFilters.doctor_id}
            >
              <option value="">All doctors</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className={inputClasses}
              onChange={(event) =>
                setAppointmentsFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
              value={appointmentsFilters.status}
            >
              {APPOINTMENT_STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {appointmentsQuery.isLoading ? (
          <SharedLoadingSpinner size="md" />
        ) : appointmentsQuery.isError ? (
          <ErrorBanner
            message={getErrorMessage(appointmentsQuery.error, 'Failed to load appointments.')}
          />
        ) : appointments.length === 0 ? (
          <SharedEmptyState message="No appointments matched these filters." title="No Appointments" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Patient</th>
                  <th className="pb-3 pr-4 font-medium">Doctor</th>
                  <th className="pb-3 pr-4 font-medium">Date / Time</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Source</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAppointments.map((appointment) => (
                  <tr key={appointment.id} className="border-b border-slate-100 align-top">
                    <td className="py-4 pr-4 font-medium text-slate-900">
                      {appointment.patient_name}
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{appointment.doctor_name}</td>
                    <td className="py-4 pr-4 text-slate-600">
                      {formatDateTime(appointment.date_time)}
                    </td>
                    <td className="py-4 pr-4">
                      <StatusBadge status={appointment.status} />
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{appointment.source}</td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          onClick={() =>
                            appointmentStatusMutation.mutate({
                              id: appointment.id,
                              status: 'completed',
                            })
                          }
                          type="button"
                        >
                          Complete
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
          totalPages={Math.max(1, Math.ceil(appointmentsTotal / PAGE_SIZE))}
          onPageChange={setAppointmentsPage}
        />

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
  )

  const renderPatients = () => (
    <SectionShell
      action={
        <button
          className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
          onClick={() => setAddPatientOpen(true)}
          type="button"
        >
          Add Patient
        </button>
      }
      description="Search patient records, review personal details, and update charts."
      title="Patients"
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Search by name or phone">
            <input
              className={inputClasses}
              onChange={(event) => setPatientSearch(event.target.value)}
              placeholder="Start typing a name or phone number"
              type="text"
              value={patientSearch}
            />
          </Field>
          <Field label="Gender">
            <select
              className={inputClasses}
              onChange={(event) =>
                setPatientFilters((current) => ({ ...current, gender: event.target.value }))
              }
              value={patientFilters.gender}
            >
              <option value="">All genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Blood group">
            <select
              className={inputClasses}
              onChange={(event) =>
                setPatientFilters((current) => ({ ...current, blood_group: event.target.value }))
              }
              value={patientFilters.blood_group}
            >
              <option value="">All groups</option>
              {patientBloodGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {patientsQuery.isLoading ? (
          <SharedLoadingSpinner size="md" />
        ) : patientsQuery.isError ? (
          <ErrorBanner
            message={getErrorMessage(patientsQuery.error, 'Failed to load patients.')}
          />
        ) : filteredPatients.length === 0 ? (
          <SharedEmptyState
            message="No patients found. Try a broader search or add a new record."
            title="No Patients"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Full name</th>
                  <th className="pb-3 pr-4 font-medium">Phone</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Blood group</th>
                  <th className="pb-3 pr-4 font-medium">Created</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPatients.map((patient) => (
                  <tr key={patient.id} className="border-b border-slate-100">
                    <td className="py-4 pr-4 font-medium text-slate-900">{patient.full_name}</td>
                    <td className="py-4 pr-4 text-slate-600">{patient.phone || 'N/A'}</td>
                    <td className="py-4 pr-4 text-slate-600">{patient.email || 'N/A'}</td>
                    <td className="py-4 pr-4 text-slate-600">{patient.blood_group || 'N/A'}</td>
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
                            date_of_birth: patient.date_of_birth || '',
                            gender: patient.gender || '',
                            blood_group: patient.blood_group || '',
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

  const renderDoctors = () => (
    <SectionShell
      action={
        <button
          className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
          onClick={() => openDoctorModal()}
          type="button"
        >
          Add Doctor
        </button>
      }
      description="Track provider availability, schedule settings, and account status."
      title="Doctors"
    >
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Field label="Search">
          <input
            className={inputClasses}
            onChange={(event) =>
              setDoctorFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="Name, specialty, or email"
            type="text"
            value={doctorFilters.search}
          />
        </Field>
        <Field label="Specialty">
          <select
            className={inputClasses}
            onChange={(event) =>
              setDoctorFilters((current) => ({ ...current, specialty: event.target.value }))
            }
            value={doctorFilters.specialty}
          >
            <option value="">All specialties</option>
            {doctorSpecialties.map((specialty) => (
              <option key={specialty} value={specialty}>
                {specialty}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className={inputClasses}
            onChange={(event) =>
              setDoctorFilters((current) => ({ ...current, status: event.target.value }))
            }
            value={doctorFilters.status}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <Field label="Working day">
          <select
            className={inputClasses}
            onChange={(event) =>
              setDoctorFilters((current) => ({ ...current, day: event.target.value }))
            }
            value={doctorFilters.day}
          >
            <option value="">Any day</option>
            {DAYS_OF_WEEK.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {doctorsQuery.isLoading ? (
        <SharedLoadingSpinner size="md" />
      ) : doctorsQuery.isError ? (
        <ErrorBanner message={getErrorMessage(doctorsQuery.error, 'Failed to load doctors.')} />
      ) : filteredDoctors.length === 0 ? (
        <SharedEmptyState message="No doctors are configured yet." title="No Doctors" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paginatedDoctors.map((doctor) => (
            <article key={doctor.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{doctor.full_name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{doctor.specialty}</p>
                </div>
                <StatusBadge status={doctor.is_active ? 'active' : 'inactive'} />
              </div>
              <dl className="mt-5 space-y-3 text-sm text-slate-600">
                <div>
                  <dt className="font-medium text-slate-800">Working days</dt>
                  <dd className="mt-1">{doctor.working_days.join(', ') || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-800">Hours</dt>
                  <dd className="mt-1">
                    {doctor.start_time || 'N/A'} to {doctor.end_time || 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-800">Slot duration</dt>
                  <dd className="mt-1">{doctor.slot_duration_mins} mins</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-800">Consultation duration</dt>
                  <dd className="mt-1">{doctor.consultation_duration_mins} mins</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-800">Accepting patients</dt>
                  <dd className="mt-1">{doctor.accepting_patients ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-700"
                  onClick={() => openDoctorModal(doctor)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                  onClick={() =>
                    toggleDoctorMutation.mutate({
                      id: doctor.id,
                      is_active: !doctor.is_active,
                    })
                  }
                  type="button"
                >
                  {doctor.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                  onClick={() => setDoctorDeleteTarget(doctor)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Pagination
        page={doctorsPage}
        totalPages={Math.max(1, Math.ceil(filteredDoctors.length / PAGE_SIZE))}
        onPageChange={setDoctorsPage}
      />
      <div className="mt-4">
        <ErrorBanner
          message={
            toggleDoctorMutation.isError
              ? getErrorMessage(toggleDoctorMutation.error, 'Unable to update doctor status.')
              : deleteDoctorMutation.isError
                ? getErrorMessage(deleteDoctorMutation.error, 'Unable to delete doctor.')
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
      description="Offer newly opened slots and manage pending demand."
      title="Waitlist"
    >
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Field label="Doctor">
          <select
            className={inputClasses}
            onChange={(event) =>
              setWaitlistFilters((current) => ({ ...current, doctor_id: event.target.value }))
            }
            value={waitlistFilters.doctor_id}
          >
            <option value="">All doctors</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className={inputClasses}
            onChange={(event) =>
              setWaitlistFilters((current) => ({ ...current, status: event.target.value }))
            }
            value={waitlistFilters.status}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="offered">Offered</option>
            <option value="expired">Expired</option>
          </select>
        </Field>
        <Field label="Requested date">
          <input
            className={inputClasses}
            onChange={(event) =>
              setWaitlistFilters((current) => ({
                ...current,
                requested_date: event.target.value,
              }))
            }
            type="date"
            value={waitlistFilters.requested_date}
          />
        </Field>
      </div>

      {waitlistQuery.isLoading ? (
        <SharedLoadingSpinner size="md" />
      ) : waitlistQuery.isError ? (
        <ErrorBanner message={getErrorMessage(waitlistQuery.error, 'Failed to load waitlist.')} />
      ) : filteredWaitlist.length === 0 ? (
        <SharedEmptyState
          message="No one is currently on the waitlist."
          title="No Waitlist Entries"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="pb-3 pr-4 font-medium">Patient</th>
                <th className="pb-3 pr-4 font-medium">Doctor</th>
                <th className="pb-3 pr-4 font-medium">Requested date</th>
                <th className="pb-3 pr-4 font-medium">Added at</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedWaitlist.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-4 pr-4 font-medium text-slate-900">{item.patient_name}</td>
                  <td className="py-4 pr-4 text-slate-600">{item.doctor_name}</td>
                  <td className="py-4 pr-4 text-slate-600">{formatDate(item.requested_date)}</td>
                  <td className="py-4 pr-4 text-slate-600">{formatDateTime(item.added_at)}</td>
                  <td className="py-4 pr-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-xl bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100"
                        onClick={() =>
                          updateWaitlistStatusMutation.mutate({
                            id: item.id,
                            status: 'offered',
                          })
                        }
                        type="button"
                      >
                        Offer Slot
                      </button>
                      <button
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                        onClick={() =>
                          updateWaitlistStatusMutation.mutate({
                            id: item.id,
                            status: 'expired',
                          })
                        }
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
        totalPages={Math.max(1, Math.ceil(filteredWaitlist.length / PAGE_SIZE))}
        onPageChange={setWaitlistPage}
      />
      <div className="mt-4">
        <ErrorBanner
          message={
            updateWaitlistStatusMutation.isError
              ? getErrorMessage(
                  updateWaitlistStatusMutation.error,
                  'Unable to update waitlist entry.',
                )
              : ''
          }
        />
      </div>
    </SectionShell>
  )

  const renderFeedback = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {feedbackStatsQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : feedbackStatsQuery.isError ? (
          <ErrorBanner
            message={getErrorMessage(feedbackStatsQuery.error, 'Failed to load doctor ratings.')}
          />
        ) : feedbackStats.length === 0 ? (
          <EmptyState message="No feedback summaries are available yet." />
        ) : (
          feedbackStats.map((stat, index) => {
            const doctorName = firstValue(stat.doctor_name, stat.full_name, `Doctor ${index + 1}`)
            const rating = Number(
              firstValue(stat.average_rating, stat.avg_rating, stat.rating, 0),
            )

            return (
              <div key={doctorName} className={`${cardClasses} p-5`}>
                <p className="text-sm font-semibold text-slate-900">{doctorName}</p>
                <div className="mt-3 flex items-center justify-between">
                  <Stars rating={Math.round(rating)} />
                  <span className="text-lg font-semibold text-slate-900">{rating.toFixed(1)}</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      <SectionShell
        description="Latest patient sentiment and care quality feedback."
        title="Feedback"
      >
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Field label="Doctor">
            <select
              className={inputClasses}
              onChange={(event) =>
                setFeedbackFilters((current) => ({ ...current, doctor: event.target.value }))
              }
              value={feedbackFilters.doctor}
            >
              <option value="">All doctors</option>
              {feedbackDoctorNames.map((doctorName) => (
                <option key={doctorName} value={doctorName}>
                  {doctorName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rating">
            <select
              className={inputClasses}
              onChange={(event) =>
                setFeedbackFilters((current) => ({ ...current, rating: event.target.value }))
              }
              value={feedbackFilters.rating}
            >
              <option value="">All ratings</option>
              <option value="5">5 stars</option>
              <option value="4">4 stars</option>
              <option value="3">3 stars</option>
              <option value="2">2 stars</option>
              <option value="1">1 star</option>
            </select>
          </Field>
          <Field label="Search">
            <input
              className={inputClasses}
              onChange={(event) =>
                setFeedbackFilters((current) => ({ ...current, search: event.target.value }))
              }
              placeholder="Patient, doctor, or comment"
              type="text"
              value={feedbackFilters.search}
            />
          </Field>
        </div>

        {feedbackQuery.isLoading ? (
          <SharedLoadingSpinner size="md" />
        ) : feedbackQuery.isError ? (
          <ErrorBanner message={getErrorMessage(feedbackQuery.error, 'Failed to load feedback.')} />
        ) : filteredFeedbackEntries.length === 0 ? (
          <SharedEmptyState message="No feedback has been submitted yet." title="No Feedback" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Patient</th>
                  <th className="pb-3 pr-4 font-medium">Doctor</th>
                  <th className="pb-3 pr-4 font-medium">Rating</th>
                  <th className="pb-3 pr-4 font-medium">Comment</th>
                  <th className="pb-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFeedbackEntries.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="py-4 pr-4 font-medium text-slate-900">{item.patient_name}</td>
                    <td className="py-4 pr-4 text-slate-600">{item.doctor_name}</td>
                    <td className="py-4 pr-4">
                      <Stars rating={item.rating} />
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{item.comment}</td>
                    <td className="py-4 text-slate-600">{formatDate(item.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={feedbackPage}
          totalPages={Math.max(1, Math.ceil(filteredFeedbackEntries.length / PAGE_SIZE))}
          onPageChange={setFeedbackPage}
        />
      </SectionShell>
    </div>
  )

  const renderReports = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          accent="bg-cyan-50 text-cyan-700"
          label="Today's Summary"
          value={
            dailyReportQuery.isLoading
              ? 'Loading...'
              : `${todaySummary.totalAppointments} appointments`
          }
        />
        <MetricCard
          accent="bg-orange-50 text-orange-700"
          label="No-Show Rate"
          value={
            noShowRateQuery.isLoading
              ? 'Loading...'
              : `${noShowRate.percentage}% (${noShowRate.total})`
          }
        />
        <MetricCard
          accent="bg-emerald-50 text-emerald-700"
          label="Waitlist Active"
          value={dailyReportQuery.isLoading ? 'Loading...' : todaySummary.activeWaitlist}
        />
      </div>

      {(dailyReportQuery.isError || noShowRateQuery.isError || doctorReportsQuery.isError) && (
        <ErrorBanner
          message={getErrorMessage(
            dailyReportQuery.error || noShowRateQuery.error || doctorReportsQuery.error,
            'Failed to load reports.',
          )}
        />
      )}

      <SectionShell
        description="Provider performance across today’s appointment outcomes."
        title="Per-Doctor Performance"
      >
        {doctorReportsQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : reportRows.length === 0 ? (
          <EmptyState message="No doctor report data is available right now." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Total appointments</th>
                  <th className="pb-3 pr-4 font-medium">Completed</th>
                  <th className="pb-3 pr-4 font-medium">Cancelled</th>
                  <th className="pb-3 font-medium">No Show</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row, index) => (
                  <tr
                    key={firstValue(row.id, row.doctor_id, row.doctor_name, index)}
                    className="border-b border-slate-100"
                  >
                    <td className="py-4 pr-4 font-medium text-slate-900">
                      {firstValue(row.doctor_name, row.name, 'Unknown doctor')}
                    </td>
                    <td className="py-4 pr-4 text-slate-600">
                      {firstValue(row.total_appointments, row.total, 0)}
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{firstValue(row.completed, 0)}</td>
                    <td className="py-4 pr-4 text-slate-600">{firstValue(row.cancelled, 0)}</td>
                    <td className="py-4 text-slate-600">{firstValue(row.no_show, row.noShows, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>
    </div>
  )

  const renderSettings = () => (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className={`${cardClasses} p-6`}>
        <h3 className="text-lg font-semibold text-slate-900">Clinic Info</h3>
        <p className="mt-4 text-sm text-slate-600">Clinic CRM Headquarters</p>
        <p className="mt-2 text-sm text-slate-500">
          123 Wellness Avenue
          <br />
          City Center, Placeholder 00000
        </p>
      </div>
      <div className={`${cardClasses} p-6`}>
        <h3 className="text-lg font-semibold text-slate-900">API Keys & n8n</h3>
        <p className="mt-4 text-sm text-slate-600">
          Store API credentials securely in environment variables and let n8n call your CRM
          endpoints for reminders, automation, and analytics sync.
        </p>
      </div>
      {renderReceptionistUserForm()}
    </div>
  )

  const sectionContent = {
    dashboard: renderDashboard(),
    appointments: renderAppointments(),
    patients: renderPatients(),
    doctors: renderDoctors(),
    waitlist: renderWaitlist(),
    feedback: renderFeedback(),
    reports: renderReports(),
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
            <p className="mt-2 text-sm text-slate-400">Admin control center</p>
          </div>
          <nav className="flex-1 space-y-2 px-4 py-6">
            <button
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
              onClick={() => navigate('/admin/users')}
              type="button"
            >
              <span className="text-base">U</span>
              <span>User Management</span>
            </button>
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
                  onClick={() => {
                    setActiveSection(item.key)
                    setSidebarOpen(false)
                  }}
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
                  Admin
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-900">{pageTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 sm:block">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Signed in</p>
                <p className="text-sm font-medium text-slate-800">{adminEmail}</p>
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
        onClose={() => setNewAppointmentOpen(false)}
        open={newAppointmentOpen}
        title="New Appointment"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            createAppointmentMutation.mutate({
              patient_id: appointmentLookupPatient?.id,
              doctor_id: appointmentForm.doctor_id,
              scheduled_at: combineDateAndTime(appointmentForm.date, appointmentForm.time),
              booking_source: 'admin',
            })
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Patient phone">
              <input
                className={inputClasses}
                onChange={(event) =>
                  setAppointmentForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                placeholder="0300 0000000"
                type="text"
                value={appointmentForm.phone}
              />
            </Field>
            <Field label="Patient name">
              <input
                className={`${inputClasses} bg-slate-50`}
                readOnly
                type="text"
                value={appointmentLookupPatient?.full_name || 'Auto-filled after lookup'}
              />
            </Field>
            <Field label="Doctor">
              <select
                className={inputClasses}
                onChange={(event) =>
                  setAppointmentForm((current) => ({
                    ...current,
                    doctor_id: event.target.value,
                    time: '',
                  }))
                }
                value={appointmentForm.doctor_id}
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
                  setAppointmentForm((current) => ({
                    ...current,
                    date: event.target.value,
                    time: '',
                  }))
                }
                type="date"
                value={appointmentForm.date}
              />
            </Field>
            <Field label="Available time slot">
              <select
                className={inputClasses}
                onChange={(event) =>
                  setAppointmentForm((current) => ({
                    ...current,
                    time: event.target.value,
                  }))
                }
                value={appointmentForm.time}
              >
                <option value="">
                  {appointmentForm.doctor_id ? 'Select a slot' : 'Choose doctor first'}
                </option>
                {(slotsQuery.data || []).map((slot, index) => {
                  const value = typeof slot === 'string' ? slot : firstValue(slot.value, slot.time, '')
                  return (
                    <option key={value || index} value={value}>
                      {formatTime(value)}
                    </option>
                  )
                })}
              </select>
            </Field>
            <Field label="Selected doctor">
              <input
                className={`${inputClasses} bg-slate-50`}
                readOnly
                type="text"
                value={selectedDoctorName || 'No doctor selected'}
              />
            </Field>
          </div>

          <ErrorBanner
            message={
              patientLookupQuery.isError
                ? getErrorMessage(patientLookupQuery.error, 'Patient not found by phone.')
                : createAppointmentMutation.isError
                  ? getErrorMessage(
                      createAppointmentMutation.error,
                      'Unable to create appointment.',
                    )
                  : ''
            }
          />

          <div className="flex justify-end">
            <button
              className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={
                createAppointmentMutation.isPending ||
                !appointmentLookupPatient?.id ||
                !appointmentForm.doctor_id ||
                !appointmentForm.time
              }
              type="submit"
            >
              {createAppointmentMutation.isPending ? 'Saving...' : 'Create appointment'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        maxWidth="max-w-3xl"
        onClose={() => {
          setAddPatientOpen(false)
          patientFormState.reset(PATIENT_FORM_INITIAL_VALUES)
        }}
        open={addPatientOpen}
        title="Add Patient"
      >
        <form
          className="space-y-4"
          onSubmit={patientFormState.handleSubmit((values) => {
            createPatientMutation.mutate(values)
          })}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Full name">
              <input
                className={getInputStateClasses(patientFormState.errors.full_name)}
                name="full_name"
                onBlur={patientFormState.handleBlur}
                onChange={patientFormState.handleChange}
                type="text"
                value={patientForm.full_name}
              />
              {patientFormState.errors.full_name ? (
                <p className="mt-1 text-sm text-red-500">{patientFormState.errors.full_name}</p>
              ) : null}
            </Field>
            <Field label="Phone">
              <input
                className={getInputStateClasses(patientFormState.errors.phone)}
                name="phone"
                onBlur={patientFormState.handleBlur}
                onChange={patientFormState.handleChange}
                type="text"
                value={patientForm.phone}
              />
              {patientFormState.errors.phone ? (
                <p className="mt-1 text-sm text-red-500">{patientFormState.errors.phone}</p>
              ) : null}
            </Field>
            <Field label="Email">
              <input
                className={getInputStateClasses(patientFormState.errors.email)}
                name="email"
                onBlur={patientFormState.handleBlur}
                onChange={patientFormState.handleChange}
                type="email"
                value={patientForm.email}
              />
              {patientFormState.errors.email ? (
                <p className="mt-1 text-sm text-red-500">{patientFormState.errors.email}</p>
              ) : null}
            </Field>
            <Field label="Password">
              <input
                className={getInputStateClasses(patientFormState.errors.password)}
                name="password"
                onBlur={patientFormState.handleBlur}
                onChange={patientFormState.handleChange}
                placeholder="Set login password"
                type="password"
                value={patientForm.password}
              />
              {patientFormState.errors.password ? (
                <p className="mt-1 text-sm text-red-500">{patientFormState.errors.password}</p>
              ) : null}
            </Field>
            <Field label="Date of birth">
              <input
                className={inputClasses}
                name="date_of_birth"
                onChange={(event) =>
                  patientFormState.handleChange(event)
                }
                type="date"
                value={patientForm.date_of_birth}
              />
            </Field>
            <Field label="Gender">
              <select
                className={inputClasses}
                name="gender"
                onChange={(event) =>
                  patientFormState.handleChange(event)
                }
                value={patientForm.gender}
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Blood group">
              <input
                className={inputClasses}
                name="blood_group"
                onChange={(event) =>
                  patientFormState.handleChange(event)
                }
                type="text"
                value={patientForm.blood_group}
              />
            </Field>
            <Field label="Allergies (optional)">
              <textarea
                className={inputClasses}
                name="allergies"
                onChange={(event) =>
                  patientFormState.handleChange(event)
                }
                rows="3"
                value={patientForm.allergies}
              />
            </Field>
            <Field label="Medical notes (optional)">
              <textarea
                className={inputClasses}
                name="medical_notes"
                onChange={(event) =>
                  patientFormState.handleChange(event)
                }
                rows="3"
                value={patientForm.medical_notes}
              />
            </Field>
          </div>

          <ErrorBanner
            message={
              createPatientMutation.isError
                ? getErrorMessage(createPatientMutation.error, 'Unable to add patient.')
                : ''
            }
          />

          <div className="flex justify-end">
            <button
              className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={
                createPatientMutation.isPending ||
                !patientFormState.isValid ||
                !patientForm.full_name.trim() ||
                !patientForm.phone.trim() ||
                !patientForm.password.trim()
              }
              type="submit"
            >
              {createPatientMutation.isPending ? 'Saving...' : 'Create patient'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        maxWidth="max-w-3xl"
        onClose={() => {
          setDoctorModal({ open: false, doctor: null })
          doctorFormState.reset(DOCTOR_FORM_INITIAL_VALUES)
        }}
        open={doctorModal.open}
        title={doctorModal.doctor ? 'Edit Doctor' : 'Add Doctor'}
      >
        <form
          autoComplete="off"
          className="space-y-4"
          key={doctorModal.doctor?.id || 'new-doctor'}
          onSubmit={doctorFormState.handleSubmit((values) => {
            const payload = {
              ...values,
              working_days: values.working_days,
              slot_duration_mins: Number(values.slot_duration_mins),
              consultation_duration_mins: Number(values.consultation_duration_mins),
              accepting_patients: Boolean(values.accepting_patients),
            }

            if (!values.password) {
              delete payload.password
            }

            if (doctorModal.doctor) {
              updateDoctorMutation.mutate({ id: doctorModal.doctor.id, payload })
              return
            }

            createDoctorMutation.mutate(payload)
          })}
        >
          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name">
                <input
                  autoComplete="name"
                  className={getInputStateClasses(doctorFormState.errors.full_name)}
                  name="full_name"
                  onBlur={doctorFormState.handleBlur}
                  onChange={doctorFormState.handleChange}
                  type="text"
                  value={doctorForm.full_name}
                />
                {doctorFormState.errors.full_name ? (
                  <p className="mt-1 text-sm text-red-500">{doctorFormState.errors.full_name}</p>
                ) : null}
              </Field>
              <Field label="Specialty">
                <input
                  className={getInputStateClasses(doctorFormState.errors.specialty)}
                  name="specialty"
                  onBlur={doctorFormState.handleBlur}
                  onChange={doctorFormState.handleChange}
                  type="text"
                  value={doctorForm.specialty}
                />
                {doctorFormState.errors.specialty ? (
                  <p className="mt-1 text-sm text-red-500">{doctorFormState.errors.specialty}</p>
                ) : null}
              </Field>
              <Field label="Email">
                <input
                  autoComplete="email"
                  className={getInputStateClasses(doctorFormState.errors.email)}
                  name="email"
                  onBlur={doctorFormState.handleBlur}
                  onChange={doctorFormState.handleChange}
                  type="email"
                  value={doctorForm.email}
                />
                {doctorFormState.errors.email ? (
                  <p className="mt-1 text-sm text-red-500">{doctorFormState.errors.email}</p>
                ) : null}
              </Field>
              <Field
                label={
                  doctorModal.doctor
                    ? 'Password (leave blank to keep current)'
                    : 'Password'
                }
              >
                <input
                  autoComplete="new-password"
                  className={getInputStateClasses(doctorFormState.errors.password)}
                  name="password"
                  onBlur={doctorFormState.handleBlur}
                  onChange={doctorFormState.handleChange}
                  placeholder={
                    doctorModal.doctor
                      ? 'Enter new password only if you want to change it'
                      : 'Set login password'
                  }
                  type="password"
                  value={doctorForm.password}
                />
                {doctorFormState.errors.password ? (
                  <p className="mt-1 text-sm text-red-500">{doctorFormState.errors.password}</p>
                ) : null}
              </Field>
              <Field label="Phone">
                <input
                  autoComplete="tel"
                  className={getInputStateClasses(doctorFormState.errors.phone)}
                  name="phone"
                  onBlur={doctorFormState.handleBlur}
                  onChange={doctorFormState.handleChange}
                  type="text"
                  value={doctorForm.phone}
                />
                {doctorFormState.errors.phone ? (
                  <p className="mt-1 text-sm text-red-500">{doctorFormState.errors.phone}</p>
                ) : null}
              </Field>
            </div>
          </section>

          <div className="border-t border-slate-200" />

          <section className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-700">Working days</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const checked = doctorForm.working_days.includes(day)
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
                          setDoctorForm((current) => ({
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
                  name="start_time"
                  onChange={doctorFormState.handleChange}
                  type="time"
                  value={doctorForm.start_time}
                />
              </Field>
              <Field label="End time">
                <input
                  className={inputClasses}
                  name="end_time"
                  onChange={doctorFormState.handleChange}
                  type="time"
                  value={doctorForm.end_time}
                />
              </Field>
              <Field label="Slot duration (mins)">
                <input
                  className={inputClasses}
                  min="5"
                  name="slot_duration_mins"
                  onChange={doctorFormState.handleChange}
                  type="number"
                  value={doctorForm.slot_duration_mins}
                />
              </Field>
              <Field label="Consultation duration (mins)">
                <input
                  className={inputClasses}
                  min="5"
                  name="consultation_duration_mins"
                  onChange={doctorFormState.handleChange}
                  type="number"
                  value={doctorForm.consultation_duration_mins}
                />
              </Field>
              <Field label="Patient intake status">
                <select
                  className={inputClasses}
                  onChange={(event) =>
                    setDoctorForm((current) => ({
                      ...current,
                      accepting_patients: event.target.value === 'true',
                    }))
                  }
                  value={doctorForm.accepting_patients ? 'true' : 'false'}
                >
                  <option value="true">Accepting patients</option>
                  <option value="false">Not accepting patients</option>
                </select>
              </Field>
            </div>
          </section>

          <ErrorBanner
            message={
              createDoctorMutation.isError
                ? getErrorMessage(createDoctorMutation.error, 'Unable to add doctor.')
                : updateDoctorMutation.isError
                  ? getErrorMessage(updateDoctorMutation.error, 'Unable to update doctor.')
                  : ''
            }
          />

          <div className="flex justify-end">
            <button
              className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={
                createDoctorMutation.isPending ||
                updateDoctorMutation.isPending ||
                !doctorFormState.isValid ||
                !doctorForm.full_name.trim() ||
                !doctorForm.specialty.trim() ||
                !doctorForm.email.trim() ||
                !doctorForm.phone.trim() ||
                (!doctorModal.doctor && !doctorForm.password.trim())
              }
              type="submit"
            >
              {createDoctorMutation.isPending || updateDoctorMutation.isPending
                ? 'Saving...'
                : doctorModal.doctor
                  ? 'Update doctor'
                  : 'Create doctor'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        maxWidth="max-w-2xl"
        onClose={() => setWaitlistModalOpen(false)}
        open={waitlistModalOpen}
        title="Add to Waitlist"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            createWaitlistMutation.mutate({
              patient_id: waitlistLookupPatient?.id,
              doctor_id: waitlistForm.doctor_id,
              requested_date: waitlistForm.requested_date,
            })
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Patient phone">
              <input
                className={inputClasses}
                onChange={(event) =>
                  setWaitlistForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                type="text"
                value={waitlistForm.phone}
              />
            </Field>
            <Field label="Patient name">
              <input
                className={`${inputClasses} bg-slate-50`}
                readOnly
                type="text"
                value={waitlistLookupPatient?.full_name || 'Auto-filled after lookup'}
              />
            </Field>
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
            <Field label="Requested date">
              <input
                className={inputClasses}
                onChange={(event) =>
                  setWaitlistForm((current) => ({
                    ...current,
                    requested_date: event.target.value,
                  }))
                }
                type="date"
                value={waitlistForm.requested_date}
              />
            </Field>
          </div>

          <ErrorBanner
            message={
              waitlistPatientLookupQuery.isError
                ? getErrorMessage(waitlistPatientLookupQuery.error, 'Patient not found by phone.')
                : createWaitlistMutation.isError
                  ? getErrorMessage(createWaitlistMutation.error, 'Unable to add to waitlist.')
                  : ''
            }
          />

          <div className="flex justify-end">
            <button
              className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={
                createWaitlistMutation.isPending ||
                !waitlistLookupPatient?.id ||
                !waitlistForm.doctor_id
              }
              type="submit"
            >
              {createWaitlistMutation.isPending ? 'Saving...' : 'Add to waitlist'}
            </button>
          </div>
        </form>
      </Modal>

      <SlidingPanel
        onClose={() => setSelectedPatient(null)}
        open={Boolean(selectedPatient)}
        title={selectedPatient ? selectedPatient.full_name : 'Patient details'}
      >
        {selectedPatient ? (
          <div className="space-y-6">
            <div className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Phone</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedPatient.phone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Email</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedPatient.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">DOB</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(selectedPatient.date_of_birth)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Blood group</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedPatient.blood_group || 'N/A'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Allergies</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedPatient.allergies || 'None recorded'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Medical notes</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedPatient.medical_notes || 'No notes yet'}</p>
              </div>
            </div>

            <div>
              <h4 className="text-base font-semibold text-slate-900">Appointment History</h4>
              <div className="mt-4">
                {patientHistoryQuery.isLoading ? (
                  <p className="text-sm text-slate-500">Loading...</p>
                ) : patientHistoryQuery.isError ? (
                  <ErrorBanner
                    message={getErrorMessage(
                      patientHistoryQuery.error,
                      'Failed to load appointment history.',
                    )}
                  />
                ) : patientHistory.length === 0 ? (
                  <EmptyState message="No appointment history found for this patient." />
                ) : (
                  <div className="space-y-3">
                    {patientHistory.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900">{item.doctor_name}</p>
                            <p className="mt-1 text-sm text-slate-500">{formatDateTime(item.date_time)}</p>
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <form
              className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5"
              onSubmit={patientEditFormState.handleSubmit(() => {
                updatePatientMutation.mutate({
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
              })}
            >
              <h4 className="text-base font-semibold text-slate-900">Edit Patient</h4>
              <div className="grid gap-4 md:grid-cols-2">
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
                <Field label="Date of birth">
                  <input
                    className={inputClasses}
                    name="date_of_birth"
                    onChange={(event) =>
                      patientEditFormState.handleChange(event)
                    }
                    type="date"
                    value={patientEditForm.date_of_birth}
                  />
                </Field>
                <Field label="Gender">
                  <select
                    className={inputClasses}
                    name="gender"
                    onChange={(event) =>
                      patientEditFormState.handleChange(event)
                    }
                    value={patientEditForm.gender}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Blood group">
                  <input
                    className={inputClasses}
                    name="blood_group"
                    onChange={(event) =>
                      patientEditFormState.handleChange(event)
                    }
                    type="text"
                    value={patientEditForm.blood_group}
                  />
                </Field>
                <Field label="Allergies (optional)">
                  <textarea
                    className={inputClasses}
                    name="allergies"
                    onChange={(event) =>
                      patientEditFormState.handleChange(event)
                    }
                    rows="3"
                    value={patientEditForm.allergies}
                  />
                </Field>
                <Field label="Medical notes (optional)">
                  <textarea
                    className={inputClasses}
                    name="medical_notes"
                    onChange={(event) =>
                      patientEditFormState.handleChange(event)
                    }
                    rows="3"
                    value={patientEditForm.medical_notes}
                  />
                </Field>
              </div>
              <ErrorBanner
                message={
                  updatePatientMutation.isError
                    ? getErrorMessage(updatePatientMutation.error, 'Unable to update patient.')
                    : ''
                }
              />
              <div className="flex justify-end">
                <button
                  className="rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={
                    updatePatientMutation.isPending ||
                    !patientEditFormState.isValid ||
                    !patientEditForm.full_name.trim() ||
                    !patientEditForm.phone.trim()
                  }
                  type="submit"
                >
                  {updatePatientMutation.isPending ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </SlidingPanel>

      <ConfirmDialog
        cancelText="Keep Doctor"
        confirmText={deleteDoctorMutation.isPending ? 'Deleting...' : 'Delete Doctor'}
        isOpen={Boolean(doctorDeleteTarget)}
        message={
          doctorDeleteTarget
            ? `Delete ${doctorDeleteTarget.full_name}? This action cannot be undone.`
            : ''
        }
        onCancel={() => setDoctorDeleteTarget(null)}
        onConfirm={() => {
          if (!doctorDeleteTarget?.id) return
          deleteDoctorMutation.mutate(doctorDeleteTarget.id, {
            onSuccess: () => setDoctorDeleteTarget(null),
          })
        }}
        title="Confirm Doctor Deletion"
        variant="danger"
      />
    </div>
  )
}

export default AdminDashboard
