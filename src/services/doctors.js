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

export const getDoctors = async (params = {}) => {
  const response = await api.get('/api/doctors', { params })
  return unwrapData(response)
}

export const getDoctorById = async (id) => {
  const response = await api.get(`/api/doctors/${id}`)
  return unwrapData(response)
}

export const createDoctor = async (data) => {
  const response = await api.post('/api/doctors', data)
  return unwrapData(response)
}

export const updateDoctor = async (id, data) => {
  const response = await api.patch(`/api/doctors/${id}`, data)
  return unwrapData(response)
}

export const toggleDoctorStatus = async (id, is_active) => {
  const response = await api.patch(`/api/doctors/${id}`, { is_active })
  return unwrapData(response)
}

export const deleteDoctor = async (id) => {
  const response = await api.delete(`/api/doctors/${id}`)
  return unwrapData(response)
}
