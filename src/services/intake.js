import api from '../lib/api.js'

const unwrapData = (response) => response.data?.data ?? response.data

export const getIntakeForm = async (appointmentId) => {
  const response = await api.get(`/api/intake-forms/${appointmentId}`)
  return unwrapData(response)
}
