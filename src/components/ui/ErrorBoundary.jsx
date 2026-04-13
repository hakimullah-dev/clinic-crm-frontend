import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Application error boundary caught an error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">
              Clinic CRM
            </p>
            <h1 className="mt-4 text-3xl font-semibold text-slate-900">Something went wrong</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              The app hit an unexpected error. You can retry this screen now, and if it keeps
              happening the error has been logged for investigation.
            </p>
            <button
              className="mt-6 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
              onClick={this.handleRetry}
              type="button"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
