import api from '../lib/api.js'

const unwrapData = (response) => response.data?.data ?? response.data

export const getPatientAppointments = async (patientId) => {
  const response = await api.get(`/api/appointments/patient/${patientId}`)
  return unwrapData(response)
}

export const getIntakeForm = async (appointmentId) => {
  const response = await api.get(`/api/intake-forms/${appointmentId}`)
  return unwrapData(response)
}

export const submitIntakeForm = async (payload) => {
  const response = await api.post('/api/intake-forms', payload)
  return unwrapData(response)
}

export const submitFeedback = async (payload) => {
  const response = await api.post('/api/feedback', payload)
  return unwrapData(response)
}
