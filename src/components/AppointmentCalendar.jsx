import { useEffect, useMemo, useState } from 'react'
import { formatDate, formatShort, formatTime, getSydneyToday, isToday } from '../lib/datetime.js'
import { getAppointments } from '../services/appointments.js'
import ConfirmDialog from './ui/ConfirmDialog.jsx'

const STATUS_STYLES = {
  confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-800',
}

const getWeekStart = (value) => {
  const date = new Date(`${value}T00:00:00`)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return date
}

const toDateKey = (date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addDays = (date, amount) => {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + amount)
  return nextDate
}

const ensureArray = (value, keys = []) => {
  if (Array.isArray(value)) return value

  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }

  return []
}

const firstValue = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '')

const normalizeAppointment = (appointment = {}) => ({
  id: firstValue(appointment.id, appointment._id, appointment.appointment_id, ''),
  patient_name: firstValue(
    appointment.patient_name,
    appointment.patient?.full_name,
    appointment.patient?.name,
    'Unknown patient',
  ),
  doctor_name: firstValue(
    appointment.doctor_name,
    appointment.doctor?.full_name,
    appointment.doctor?.name,
    'Unknown doctor',
  ),
  date_time: firstValue(
    appointment.date_time,
    appointment.datetime,
    appointment.scheduled_at,
    appointment.date,
    '',
  ),
  scheduled_at: firstValue(
    appointment.scheduled_at,
    appointment.date_time,
    appointment.datetime,
    appointment.date,
    '',
  ),
  status: firstValue(appointment.status, 'pending'),
})

function AppointmentCalendar({ appointments: externalAppointments }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(getSydneyToday()))
  const [appointments, setAppointments] = useState([])
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const weekEnd = useMemo(() => addDays(weekStart, 5), [weekStart])

  const weekDays = useMemo(
    () => Array.from({ length: 6 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  )

  useEffect(() => {
    if (Array.isArray(externalAppointments)) {
      setAppointments(externalAppointments.map(normalizeAppointment))
      return
    }

    const from = formatShort(weekStart)
    const to = formatShort(weekEnd)

    getAppointments({ from, to })
      .then((data) => {
        setAppointments(ensureArray(data, ['appointments', 'data']).map(normalizeAppointment))
      })
      .catch((error) => {
        console.error(error)
        setAppointments([])
      })
  }, [externalAppointments, weekEnd, weekStart])

  const groupedAppointments = useMemo(() => {
    return appointments.reduce((result, appointment) => {
      const key = appointment.date_time ? appointment.date_time.slice(0, 10) : appointment.scheduled_at?.slice(0, 10)
      if (!key) return result
      if (!result[key]) result[key] = []
      result[key].push(appointment)
      return result
    }, {})
  }, [appointments])

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Calendar</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">Week View</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => setWeekStart((current) => addDays(current, -7))}
            type="button"
          >
            Prev Week
          </button>
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => setWeekStart(getWeekStart(getSydneyToday()))}
            type="button"
          >
            Today
          </button>
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => setWeekStart((current) => addDays(current, 7))}
            type="button"
          >
            Next Week
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-6">
        {weekDays.map((day) => {
          const key = toDateKey(day)
          const dayAppointments = (groupedAppointments[key] || []).sort((a, b) => {
            return new Date(a.date_time || a.scheduled_at).getTime() - new Date(b.date_time || b.scheduled_at).getTime()
          })

          return (
            <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="border-b border-slate-200 pb-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  {isToday(key) ? 'Today' : formatDate(key)}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatShort(key)}</p>
              </div>
              <div className="mt-4 space-y-3">
                {dayAppointments.length === 0 ? (
                  <p className="text-sm text-slate-500">No appointments</p>
                ) : (
                  dayAppointments.map((appointment) => (
                    <button
                      key={appointment.id}
                      className={`w-full rounded-2xl border p-3 text-left text-sm transition hover:shadow-sm ${STATUS_STYLES[appointment.status] || 'border-slate-200 bg-white text-slate-700'}`}
                      onClick={() => setSelectedAppointment(appointment)}
                      type="button"
                    >
                      <p className="font-semibold">{formatTime(appointment.date_time || appointment.scheduled_at)}</p>
                      <p className="mt-1">{appointment.patient_name || 'Unknown patient'}</p>
                      <p className="mt-1 text-xs opacity-80">{appointment.doctor_name || 'Unknown doctor'}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        cancelText="Close"
        confirmText="Close"
        isOpen={Boolean(selectedAppointment)}
        message={
          selectedAppointment
            ? `${selectedAppointment.patient_name || 'Unknown patient'} with ${selectedAppointment.doctor_name || 'Unknown doctor'} on ${formatDate(selectedAppointment.date_time || selectedAppointment.scheduled_at)} at ${formatTime(selectedAppointment.date_time || selectedAppointment.scheduled_at)}. Status: ${selectedAppointment.status || 'unknown'}.`
            : ''
        }
        onCancel={() => setSelectedAppointment(null)}
        onConfirm={() => setSelectedAppointment(null)}
        title="Appointment Details"
        variant="warning"
      />
    </div>
  )
}

export default AppointmentCalendar
