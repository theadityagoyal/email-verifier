import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'

const queryClient = new QueryClient()

// Error boundary component for graceful error handling
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Log error to monitoring service in production
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI when error occurs
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--foreground)] p-6">
          <div className="text-center bg-[var(--card)] rounded-xl p-8 shadow-lg max-w-2xl w-full">
            <h2 className="text-2xl font-bold text-[var(--error)] mb-4">
              Something went wrong
            </h2>
            <p className="text-[var(--foreground)]/70 mb-6">
              We're sorry, but an unexpected error occurred. Please try refreshing the page.
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-4 p-4 bg-[var(--muted)]/50 rounded-lg text-sm">
                  <code className="bg-[var(--card)]/50 px-2 py-1 rounded">
                    {this.state.error?.toString()}
                  </code>
                </div>
              )}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary hover:bg-[var(--accent-hover)]"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Dynamically import React Query Devtools only in development
const ReactQueryDevtools = process.env.NODE_ENV === 'development'
  ? lazy(() => import('@tanstack/react-query-devtools').then(mod => ({
      default: mod.ReactQueryDevtools
    })))
  : null

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
          {/* React Query Devtools - only in development */}
          {process.env.NODE_ENV === 'development' && (
            <Suspense fallback={null}>
              <ReactQueryDevtools initialIsOpen={false} />
            </Suspense>
          )}
        </ErrorBoundary>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)