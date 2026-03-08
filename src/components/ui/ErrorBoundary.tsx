import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    if (import.meta.env.DEV) {
      console.error('3D Viewer Error:', error, info)
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="w-full h-full flex items-center justify-center bg-stage">
          <div className="flex flex-col items-center gap-4 p-8 max-w-sm text-center">
            <AlertTriangle size={48} className="text-danger" />
            <h2 className="text-soft text-lg font-medium">3D Viewer Error</h2>
            <p className="text-faint text-sm">
              {this.state.error?.message ?? 'An unexpected error occurred in the 3D viewer.'}
            </p>
            <Button
              variant="outline"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="gap-2"
            >
              <RefreshCw size={14} />
              Try Again
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
