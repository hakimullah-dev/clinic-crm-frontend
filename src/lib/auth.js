const KNOWN_DASHBOARD_PATHS = {
  admin: '/admin',
  doctor: '/doctor',
  receptionist: '/receptionist',
  patient: '/patient',
}

const ROLE_PATH_ALIASES = {
  super_admin: 'admin',
  'super-admin': 'admin',
}

const TOKEN_STORAGE_KEY = 'clinic_token'
const USER_STORAGE_KEY = 'clinic_user'
const ROLE_STORAGE_KEY = 'clinic_role'

export const normalizeToken = (rawToken) => {
  if (!rawToken) {
    return ''
  }

  let token = String(rawToken).trim()

  if (token.toLowerCase().startsWith('bearer ')) {
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

export const normalizeRole = (role) => {
  if (!role) {
    return ''
  }

  return String(role).trim().toLowerCase()
}

export const getRolePathSegment = (role) => {
  const normalizedRole = normalizeRole(role)
  const aliasedRole = ROLE_PATH_ALIASES[normalizedRole] || normalizedRole

  if (!aliasedRole) {
    return ''
  }

  if (KNOWN_DASHBOARD_PATHS[aliasedRole]) {
    return KNOWN_DASHBOARD_PATHS[aliasedRole].slice(1)
  }

  return aliasedRole.replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')
}

export const getDashboardPathForRole = (role) => {
  const normalizedRole = normalizeRole(role)
  const aliasedRole = ROLE_PATH_ALIASES[normalizedRole] || normalizedRole

  if (!aliasedRole) {
    return '/login'
  }

  return KNOWN_DASHBOARD_PATHS[aliasedRole] || `/${getRolePathSegment(aliasedRole)}`
}

export const getRoleFromLoginPayload = (payload = {}) => {
  return normalizeRole(payload.role || payload.user?.role || payload.user?.user_role || '')
}

export const getStoredRole = () => normalizeRole(localStorage.getItem(ROLE_STORAGE_KEY))

export const getStoredUser = () => {
  const rawUser = localStorage.getItem(USER_STORAGE_KEY)

  if (!rawUser) {
    return null
  }

  try {
    return JSON.parse(rawUser)
  } catch {
    return null
  }
}

export const hasValidStoredToken = () => Boolean(normalizeToken(localStorage.getItem(TOKEN_STORAGE_KEY)))

export const isAuthenticated = () =>
  Boolean(getStoredUser() && getStoredRole() && hasValidStoredToken())

export const clearStoredAuth = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(USER_STORAGE_KEY)
  localStorage.removeItem(ROLE_STORAGE_KEY)
}

export const persistAuth = ({ token, user, role }) => {
  const normalizedToken = normalizeToken(token)
  const normalizedRole = normalizeRole(role)

  localStorage.setItem(TOKEN_STORAGE_KEY, normalizedToken)
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user || null))
  localStorage.setItem(ROLE_STORAGE_KEY, normalizedRole)
}

export const authStorageKeys = {
  token: TOKEN_STORAGE_KEY,
  user: USER_STORAGE_KEY,
  role: ROLE_STORAGE_KEY,
}
