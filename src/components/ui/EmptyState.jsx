function EmptyState({ title, message, actionLabel, onAction, icon = '•' }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-xl text-slate-500">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
      {actionLabel && onAction ? (
        <button
          className="mt-5 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export default EmptyState
