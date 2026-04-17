import api from '../lib/api.js'
import { normalizeRegisterUserResponse } from '../lib/clinicData.js'

export const registerUser = async (data) => {
  const response = await api.post('/api/auth/register', data)
  return normalizeRegisterUserResponse(response.data)
}
