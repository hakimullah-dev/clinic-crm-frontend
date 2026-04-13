import api from '../lib/api.js'

const unwrapData = (response) => response.data?.data ?? response.data

export const registerUser = async (data) => {
  const response = await api.post('/api/auth/register', data)
  return unwrapData(response)
}
