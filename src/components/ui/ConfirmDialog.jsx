import { useEffect } from 'react'

const VARIANT_STYLES = {
  danger: 'bg-rose-600 hover:bg-rose-700',
  warning: 'bg-amber-500 hover:bg-amber-600',
}

function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
}) {
  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCancel()
      }

      if (event.key === 'Enter') {
        onConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel, onConfirm])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={onCancel}
            type="button"
          >
            {cancelText}
          </button>
          <button
            className={`rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition ${VARIANT_STYLES[variant] || VARIANT_STYLES.warning}`}
            onClick={onConfirm}
            type="button"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
