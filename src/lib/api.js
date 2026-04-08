import axios from 'axios'
import { apiBaseUrl } from './config.js'

const normalizeToken = (rawToken) => {
  if (!rawToken) {
    return ''
  }

  let token = String(rawToken).trim()

  if (token.startsWith('Bearer ')) {
    token = token.slice(7).trim()
  }

  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim()
  }

  return token
}

const clearAuthState = () => {
  localStorage.removeItem('clinic_token')
  localStorage.removeItem('clinic_user')
  localStorage.removeItem('clinic_role')
}

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
    const isAuthError =
      status === 401 ||
      status === 403 ||
      message.includes('invalid token') ||
      message.includes('unauthorized') ||
      message.includes('jwt')

    if (isAuthError) {
      clearAuthState()

      if (window.location.pathname !== '/login') {
        window.location.replace('/login')
      }
    }

    return Promise.reject(error)
  },
)

export default api
