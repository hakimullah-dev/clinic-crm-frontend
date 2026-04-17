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

const TOKEN_STORAGE_KEY = 'token'
const USER_STORAGE_KEY = 'user'
const ROLE_STORAGE_KEY = 'role'

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

export const getStoredToken = () => normalizeToken(sessionStorage.getItem(TOKEN_STORAGE_KEY))

export const hasValidStoredToken = () => Boolean(getStoredToken())

export const isAuthenticated = () =>
  Boolean(getStoredRole() && hasValidStoredToken())

export const clearStoredAuth = () => {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(USER_STORAGE_KEY)
  localStorage.removeItem(ROLE_STORAGE_KEY)
}

export const persistAuth = ({ token, user, role }) => {
  const normalizedToken = normalizeToken(token)
  const normalizedRole = normalizeRole(role)
  const storedUser = user
    ? {
        id: user.id ?? user._id ?? user.user_id ?? user.patient_id ?? user.doctor_id ?? null,
        _id: user._id ?? user.id ?? null,
        email: user.email ?? '',
        full_name: user.full_name ?? user.name ?? '',
        role: user.role ?? user.user_role ?? normalizedRole,
        doctor_id: user.doctor_id ?? null,
        patient_id: user.patient_id ?? null,
        receptionist_id: user.receptionist_id ?? null,
      }
    : null

  sessionStorage.setItem(TOKEN_STORAGE_KEY, normalizedToken)
  if (storedUser) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(storedUser))
  } else {
    localStorage.removeItem(USER_STORAGE_KEY)
  }

  if (normalizedRole) {
    localStorage.setItem(ROLE_STORAGE_KEY, normalizedRole)
  } else {
    localStorage.removeItem(ROLE_STORAGE_KEY)
  }
}

export const authStorageKeys = {
  token: TOKEN_STORAGE_KEY,
  user: USER_STORAGE_KEY,
  role: ROLE_STORAGE_KEY,
}
