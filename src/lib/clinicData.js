export const firstValue = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '')

export const ensureArray = (value, keys = []) => {
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

export const normalizeDelimitedList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

export const coerceBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'active', 'enabled', 'open'].includes(normalized)) {
      return true
    }

    if (['false', '0', 'no', 'inactive', 'disabled', 'closed'].includes(normalized)) {
      return false
    }
  }

  return fallback
}

const getSlotArray = (payload) => {
  const preferredKeys = ['available_slots', 'availableSlots']

  for (const key of preferredKeys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key]
    }
  }

  return ensureArray(payload, ['slots', 'data'])
}

export const normalizeSlotOptions = (payload) =>
  getSlotArray(payload)
    .map((slot) => {
      if (typeof slot === 'string') {
        return slot
      }

      const status = String(
        firstValue(slot.status, slot.slot_status, slot.slotStatus, ''),
      ).toLowerCase()
      const isTaken = coerceBoolean(
        firstValue(slot.taken, slot.booked, slot.is_booked, slot.isBooked, false),
        false,
      )
      const isAvailable = coerceBoolean(
        firstValue(
          slot.available,
          slot.is_available,
          slot.isAvailable,
          !isTaken && !['taken', 'booked', 'unavailable', 'occupied'].includes(status),
        ),
        true,
      )

      if (!isAvailable || isTaken || ['taken', 'booked', 'unavailable', 'occupied'].includes(status)) {
        return null
      }

      return firstValue(
        slot.value,
        slot.time,
        slot.start_time,
        slot.startTime,
        slot.slot,
        slot.label,
        '',
      )
    })
    .filter(Boolean)

export const normalizeRegisterUserResponse = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload
  }

  const nestedData =
    payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : {}

  return {
    ...nestedData,
    ...payload,
    existing: coerceBoolean(firstValue(payload.existing, nestedData.existing, false), false),
    message: firstValue(payload.message, nestedData.message, ''),
    data: nestedData,
  }
}
