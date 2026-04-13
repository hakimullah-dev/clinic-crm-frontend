const trimTrailingSlash = (value) => value.replace(/\/+$/, '')

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0'])
const canUseWindow = typeof window !== 'undefined'

const rawApiUrl = String(import.meta.env.VITE_API_URL || '').trim()

const isLocalUrl = (value) => {
  if (!value) return false

  try {
    return LOCAL_HOSTS.has(new URL(value).hostname)
  } catch {
    return false
  }
}

const windowOrigin = canUseWindow ? trimTrailingSlash(window.location.origin) : ''
const deployedHost = canUseWindow ? window.location.hostname : ''
const shouldUseWindowOrigin =
  import.meta.env.PROD &&
  windowOrigin &&
  !LOCAL_HOSTS.has(deployedHost) &&
  (!rawApiUrl || isLocalUrl(rawApiUrl))

export const apiBaseUrl = shouldUseWindowOrigin
  ? windowOrigin
  : rawApiUrl
    ? trimTrailingSlash(rawApiUrl)
    : ''

export const apiConfigError = apiBaseUrl
  ? ''
  : 'Missing VITE_API_URL. Set it to your deployed backend URL before building the frontend.'

export const getApiErrorMessage = (error, fallback) => {
  if (apiConfigError) {
    return apiConfigError
  }

  if (!error?.response && error?.message === 'Network Error') {
    return `Unable to reach API at ${apiBaseUrl || 'the configured backend URL'}. Check VITE_API_URL and redeploy the frontend.`
  }

  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  )
}
