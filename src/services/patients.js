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

export const getPatients = async (page = 1, search = '') => {
  const response = await api.get('/api/patients', {
    params: {
      page,
      search: search || undefined,
    },
  })

  return unwrapData(response)
}

export const getPatientById = async (id) => {
  const response = await api.get(`/api/patients/${id}`)
  return unwrapData(response)
}

export const getPatientByPhone = async (phone) => {
  const response = await api.get(`/api/patients/phone/${phone}`)
  return unwrapData(response)
}

export const createPatient = async (data) => {
  const response = await api.post('/api/patients', data)
  return unwrapData(response)
}

export const updatePatient = async (id, data) => {
  const response = await api.patch(`/api/patients/${id}`, data)
  return unwrapData(response)
}
