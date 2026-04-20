import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useT } from '../contexts/LanguageContext'
import type { DashboardStrings } from '../contexts/LanguageContext'

interface Props {
  children: ReactNode
  /** Optional custom fallback. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode
  t?: DashboardStrings
}

interface State {
  error: Error | null
}

class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    const t = this.props.t
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset)
      return (
        <div className="min-h-screen flex items-center justify-center bg-lmu-primary px-6">
          <div className="bg-lmu-secondary border border-red-800/50 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
            <div className="flex justify-center">
              <svg
                width="40" height="40" viewBox="0 0 24 24"
                fill="none" stroke="#facc15" strokeWidth={1.5}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-white font-semibold text-lg">{t?.somethingWrong ?? 'Algo salió mal'}</h2>
            <p className="text-gray-400 text-sm">
              {t?.unexpectedError ?? 'Ocurrió un error inesperado. Por favor recarga la página.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.reset}
                className="bg-lmu-accent hover:bg-lmu-accent/90 text-black text-sm
                           font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {t?.retry ?? 'Reintentar'}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-lmu-highlight hover:bg-lmu-highlight/80 text-white text-sm
                           font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {t?.reloadPage ?? 'Recargar página'}
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function ErrorBoundary(props: Omit<Props, 't'>) {
  const t = useT()
  return <ErrorBoundaryInner {...props} t={t} />
}
