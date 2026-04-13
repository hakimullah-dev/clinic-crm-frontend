function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)

  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
      <button
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        Prev
      </button>
      {pages.map((pageNumber) => (
        <button
          key={pageNumber}
          className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
            pageNumber === page
              ? 'bg-cyan-600 text-white'
              : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
          onClick={() => onPageChange(pageNumber)}
          type="button"
        >
          {pageNumber}
        </button>
      ))}
      <button
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        Next
      </button>
    </div>
  )
}

export default Pagination
