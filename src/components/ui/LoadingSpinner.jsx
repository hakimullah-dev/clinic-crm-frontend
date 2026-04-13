const SIZE_STYLES = {
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-4',
  lg: 'h-12 w-12 border-4',
}

function LoadingSpinner({ size = 'md', fullPage = false }) {
  const spinner = (
    <div
      className={`animate-spin rounded-full border-slate-200 border-t-cyan-600 ${SIZE_STYLES[size] || SIZE_STYLES.md}`}
    />
  )

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-[95] flex items-center justify-center bg-white/70 backdrop-blur-sm">
        {spinner}
      </div>
    )
  }

  return <div className="flex items-center justify-center py-10">{spinner}</div>
}

export default LoadingSpinner
