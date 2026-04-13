import api from '../lib/api.js'

const unwrapData = (response) => response.data?.data ?? response.data

export const getSummary = async (date) => {
  const response = await api.get('/api/reports/daily', {
    params: { date },
  })
  return unwrapData(response)
}

export const getDoctorStats = async (from, to) => {
  const response = await api.get('/api/reports/doctors', {
    params: { from, to },
  })
  return unwrapData(response)
}

export const getNoShowRate = async (days) => {
  const response = await api.get('/api/reports/no-show-rate', {
    params: { days },
  })
  return unwrapData(response)
}

export const getUpcoming = async (hours) => {
  const response = await api.get('/api/appointments/upcoming', {
    params: { hours },
  })
  return unwrapData(response)
}
