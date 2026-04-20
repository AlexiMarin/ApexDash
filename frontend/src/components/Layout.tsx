import { Outlet, Link } from 'react-router-dom'
import { useLang, useT } from '../contexts/LanguageContext'
import ErrorBoundary from './ErrorBoundary'
import apexdashLogo from '../assets/apexdash_logo.svg'

export default function Layout() {
  const { lang, toggle } = useLang()
  const t = useT()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-lmu-secondary border-b border-lmu-highlight px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <img src={apexdashLogo} alt="ApexTime" className="h-16" />
          </Link>
          <div className="flex items-center">
            <nav className="flex items-center gap-6">
              <Link to="/" className="hover:text-lmu-accent transition-colors">
                {t.liveView}
              </Link>
              <span className="text-gray-600 cursor-not-allowed select-none">
                {t.sessions}
              </span>
              <span className="text-gray-600 cursor-not-allowed select-none">
                {t.compareLaps}
              </span>
              <Link to="/novedades" className="hover:text-lmu-accent transition-colors">
                {t.whatsNew}
              </Link>
            </nav>
            <div className="flex items-center gap-3 ml-4 border-l border-lmu-highlight pl-4">
              <button
                onClick={toggle}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-lmu-highlight/40
                           bg-lmu-primary text-gray-300 hover:text-white transition-colors"
              >
                {lang === 'es' ? 'EN' : 'ES'}
              </button>
              <a
                href="https://github.com/AlexiMarin/ApexDash"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg
                           border border-lmu-highlight/40 bg-lmu-primary text-gray-300
                           hover:text-lmu-accent hover:border-lmu-accent/50 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-lmu-accent">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                Star
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="border-t border-lmu-highlight/20 py-6 text-center text-xs text-gray-600">
        ApexDash — {new Date().getFullYear()} · {t.footerLove}
      </footer>
    </div>
  )
}
