import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ToastContext = createContext(null)

const TOAST_STYLES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (message, type = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      setToasts((current) => [...current, { id, message, type }])
      window.setTimeout(() => dismissToast(id), 4000)
    },
    [dismissToast],
  )

  const value = useMemo(() => ({ showToast, dismissToast, toasts }), [dismissToast, showToast, toasts])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }

  return context
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToast()

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg ${TOAST_STYLES[toast.type] || TOAST_STYLES.success}`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium">{toast.message}</p>
            <button
              className="rounded-full px-2 py-1 text-xs font-semibold hover:bg-white/60"
              onClick={() => dismissToast(toast.id)}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
