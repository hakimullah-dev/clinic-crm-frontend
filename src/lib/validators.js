import { isClinicDay as isClinicDayValue, isFuture as isFutureDate } from './datetime.js'

export const required = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return 'This field is required'
  }

  return ''
}

export const minLength = (value, n) => {
  if (!String(value || '').trim()) return ''
  return String(value).trim().length < n ? `Minimum ${n} characters` : ''
}

export const isEmail = (value) => {
  if (!String(value || '').trim()) return ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())
    ? ''
    : 'Enter a valid email'
}

export const isPhone = (value) => {
  if (!String(value || '').trim()) return ''
  const normalized = String(value).replace(/\s+/g, '')
  return /^(?:\+61|0)4\d{8}$/.test(normalized) ? '' : 'Enter valid AU phone (04xx or +61)'
}

export const isDate = (value) => {
  if (!String(value || '').trim()) return ''
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim()) || !Number.isNaN(new Date(value).getTime())
    ? ''
    : 'Enter a valid date'
}

export const isFuture = (value) => {
  if (!String(value || '').trim()) return ''
  return isFutureDate(value) ? '' : 'Date must be in the future'
}

export const isClinicDay = (value) => {
  if (!String(value || '').trim()) return ''
  return isClinicDayValue(value) ? '' : 'Clinic is closed on Sundays'
}
