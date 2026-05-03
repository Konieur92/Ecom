import { Component, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6 flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <h1 className="text-lg font-semibold text-neutral-800">Une erreur inattendue s'est produite</h1>
            <p className="text-sm text-neutral-500 font-mono bg-neutral-50 rounded p-3 w-full text-left">
              {this.state.error.message}
            </p>
            <button
              className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
              onClick={() => window.location.reload()}
            >
              Réessayer
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
