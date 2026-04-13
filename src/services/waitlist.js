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

export const getWaitlist = async (params = {}) => {
  const response = await api.get('/api/waitlist', { params })
  return unwrapData(response)
}

export const createWaitlist = async (data) => {
  const response = await api.post('/api/waitlist', data)
  return unwrapData(response)
}

export const updateWaitlistStatus = async (id, status) => {
  const response = await api.patch(`/api/waitlist/${id}/status`, { status })
  return unwrapData(response)
}
