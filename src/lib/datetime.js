const SYDNEY_TIMEZONE = 'Australia/Sydney'
const LOCALE = 'en-AU'

const PARTS_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: SYDNEY_TIMEZONE,
})

const DATE_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: SYDNEY_TIMEZONE,
})

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: SYDNEY_TIMEZONE,
})

const SHORT_WEEKDAY_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  timeZone: SYDNEY_TIMEZONE,
})

const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  timeZone: SYDNEY_TIMEZONE,
})

const DAY_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  timeZone: SYDNEY_TIMEZONE,
})

const TIME_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: SYDNEY_TIMEZONE,
})

const TIMEZONE_OFFSET_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
  timeZone: SYDNEY_TIMEZONE,
  timeZoneName: 'shortOffset',
})

const isTimeOnlyValue = (value) => /^\d{2}:\d{2}(?::\d{2})?$/.test(String(value || '').trim())

const getDateInstance = (value) => {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const normalizedValue = String(value).trim()
  if (!normalizedValue) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    const [year, month, day] = normalizedValue.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day, 12))
  }

  const date = new Date(normalizedValue)
  return Number.isNaN(date.getTime()) ? null : date
}

const getSydneyParts = (value = new Date()) => {
  const date = getDateInstance(value)
  if (!date) {
    return null
  }

  return PARTS_FORMATTER.formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') {
      result[part.type] = part.value
    }
    return result
  }, {})
}

const getSydneyDateKey = (value = new Date()) => {
  const parts = getSydneyParts(value)
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : ''
}

const toSydneyDayNumber = (value) => {
  const key = getSydneyDateKey(value)
  if (!key) {
    return Number.NaN
  }

  const [year, month, day] = key.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
}

export const formatDate = (dateStr) => {
  const date = getDateInstance(dateStr)
  return date ? DATE_FORMATTER.format(date) : 'N/A'
}

export const formatTime = (dateStr) => {
  const normalizedValue = String(dateStr || '').trim()

  if (isTimeOnlyValue(normalizedValue)) {
    const [hoursValue, minutes] = normalizedValue.split(':')
    const hours = Number(hoursValue)
    const suffix = hours >= 12 ? 'pm' : 'am'
    const hour12 = hours % 12 || 12
    return `${hour12}:${minutes} ${suffix}`
  }

  const date = getDateInstance(dateStr)
  return date ? TIME_FORMATTER.format(date).toLowerCase() : 'N/A'
}

export const formatDateTime = (dateStr) => {
  const date = getDateInstance(dateStr)
  if (!date) {
    return 'N/A'
  }

  return `${SHORT_WEEKDAY_FORMATTER.format(date)} ${DAY_FORMATTER.format(date)} ${SHORT_MONTH_FORMATTER.format(date)}, ${formatTime(date)}`
}

export const formatShort = (dateStr) => {
  const date = getDateInstance(dateStr)
  return date ? SHORT_DATE_FORMATTER.format(date) : 'N/A'
}

export const isToday = (dateStr) => {
  if (!getDateInstance(dateStr)) {
    return false
  }

  return getSydneyDateKey(dateStr) === getSydneyDateKey(new Date())
}

export const isPast = (dateStr) => {
  const targetDay = toSydneyDayNumber(dateStr)
  const todayDay = toSydneyDayNumber(new Date())
  return Number.isFinite(targetDay) && Number.isFinite(todayDay) ? targetDay < todayDay : false
}

export const isFuture = (dateStr) => {
  const targetDay = toSydneyDayNumber(dateStr)
  const todayDay = toSydneyDayNumber(new Date())
  return Number.isFinite(targetDay) && Number.isFinite(todayDay) ? targetDay > todayDay : false
}

export const getAESTOffset = () => {
  const offsetPart = TIMEZONE_OFFSET_FORMATTER
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value

  const match = String(offsetPart || '').match(/GMT([+-]\d{1,2})/)
  return match ? Number(match[1]) : 10
}

export const toInputFormat = (dateStr) => {
  const parts = getSydneyParts(dateStr)
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : ''
}

export const getSydneyToday = () => getSydneyDateKey(new Date())

export const isClinicDay = (dateStr) => {
  const date = getDateInstance(dateStr)
  return date ? SHORT_WEEKDAY_FORMATTER.format(date) !== 'Sun' : false
}

export const combineDateAndTime = (dateStr, timeStr) => {
  const normalizedDate = String(dateStr || '').trim()
  const normalizedTime = String(timeStr || '').trim()

  if (!normalizedDate || !normalizedTime) {
    return ''
  }

  const timeValue = normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime
  return `${normalizedDate}T${timeValue}`
}

export const addDaysToDateKey = (dateStr, amount) => {
  const date = getDateInstance(dateStr)
  if (!date) {
    return ''
  }

  const nextDate = new Date(date)
  nextDate.setUTCDate(nextDate.getUTCDate() + amount)
  return getSydneyDateKey(nextDate)
}

export const getTimestamp = (dateStr) => {
  const date = getDateInstance(dateStr)
  return date ? date.getTime() : Number.NaN
}

export const isDateTimeFuture = (dateStr) => {
  const timestamp = getTimestamp(dateStr)
  return Number.isFinite(timestamp) ? timestamp > Date.now() : false
}

export const hoursUntil = (dateStr) => {
  const timestamp = getTimestamp(dateStr)
  return Number.isFinite(timestamp) ? (timestamp - Date.now()) / 3600000 : Number.NaN
}
