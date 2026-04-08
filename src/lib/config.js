const trimTrailingSlash = (value) => value.replace(/\/+$/, '')

const rawApiUrl = String(import.meta.env.VITE_API_URL || '').trim()

export const apiBaseUrl = rawApiUrl ? trimTrailingSlash(rawApiUrl) : ''

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
