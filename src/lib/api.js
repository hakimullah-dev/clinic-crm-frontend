import axios from 'axios'
import { clearStoredAuth, normalizeToken } from './auth.js'
import { apiBaseUrl } from './config.js'

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = normalizeToken(localStorage.getItem('clinic_token'))

  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
    localStorage.setItem('clinic_token', token)
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const message = String(error?.response?.data?.message || '').toLowerCase()
    const isTokenError =
      message.includes('invalid token') ||
      message.includes('token expired') ||
      message.includes('expired token') ||
      message.includes('jwt') ||
      message.includes('malformed token')
    const isAuthError =
      status === 401 ||
      (status === 403 && isTokenError) ||
      isTokenError

    if (isAuthError) {
      clearStoredAuth()

      if (window.location.pathname !== '/login') {
        window.location.replace('/login')
      }
    }

    return Promise.reject(error)
  },
)

export default api
