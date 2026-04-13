import api from '../lib/api.js'

const unwrapData = (response) => {
  const payload = response.data

  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload) {
    const hasPaginationMeta = ['total', 'count', 'page', 'limit', 'pagination', 'meta'].some(
      (key) => key in payload,
    )

    return hasPaginationMeta ? payload : payload.data
  }

  return payload
}

export const getAppointments = async (filters = {}) => {
  const response = await api.get('/api/appointments', { params: filters })
  return unwrapData(response)
}

export const getSlots = async (doctorId, date) => {
  const response = await api.get(`/api/appointments/slots/${doctorId}`, {
    params: { date },
  })
  return unwrapData(response)
}

export const createAppointment = async (data) => {
  const response = await api.post('/api/appointments', data)
  return unwrapData(response)
}

export const getPatientAppointments = async (patientId) => {
  const response = await api.get(`/api/appointments/patient/${patientId}`)
  return unwrapData(response)
}

export const getDoctorAppointments = async (doctorId, filters = {}) => {
  const response = await api.get('/api/appointments', {
    params: {
      doctor_id: doctorId,
      ...filters,
    },
  })
  return unwrapData(response)
}

export const getDoctorSchedule = async (doctorId) => {
  const response = await api.get(`/api/appointments/doctor/${doctorId}`)
  return unwrapData(response)
}

export const updateAppointment = async (id, data) => {
  const response = await api.patch(`/api/appointments/${id}`, data)
  return unwrapData(response)
}

export const updateAppointmentStatus = async (id, status) => {
  const response = await api.patch(`/api/appointments/${id}/status`, { status })
  return unwrapData(response)
}

export const cancelAppointment = async (id) => {
  const response = await api.patch(`/api/appointments/${id}/status`, {
    status: 'cancelled',
  })
  return unwrapData(response)
}

export const rescheduleAppointment = async (id, data) => {
  const response = await api.patch(`/api/appointments/${id}`, data)
  return unwrapData(response)
}
