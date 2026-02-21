import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render errors in descendant components and shows a graceful fallback
 * instead of a blank page. Captures error details for debugging.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console for development; in production this could go to a telemetry service
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-dim">
            <AlertTriangle className="h-7 w-7 text-danger" />
          </div>
          <h2 className="text-base font-bold text-text-primary">Something went wrong</h2>
          <p className="mt-2 max-w-md text-sm text-text-muted leading-relaxed">
            An unexpected error occurred while rendering this section. This has been logged for debugging.
          </p>
          {this.state.error && (
            <pre className="mt-3 max-w-md rounded-lg border border-border bg-surface-elevated px-3 py-2 text-left text-[11px] font-mono text-danger/80 overflow-auto max-h-32">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleRetry}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-surface-elevated px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
