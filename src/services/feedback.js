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

export const getFeedback = async (params = {}) => {
  const response = await api.get('/api/feedback', { params })
  return unwrapData(response)
}

export const getDoctorFeedbackStats = async () => {
  const response = await api.get('/api/feedback/stats/doctors')
  return unwrapData(response)
}
