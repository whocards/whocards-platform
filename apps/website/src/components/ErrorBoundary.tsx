import {logError} from '@whocards/observability'
import type {ReactNode} from 'react'
import {Component} from 'react'

type Props = {children: ReactNode; fallback?: ReactNode}
type State = {hasError: boolean}

/**
 * Web error boundary: catches render-time throws from React islands so a crash
 * shows a recoverable fallback instead of a blank island, and routes the error
 * through @whocards/observability (console in dev, PostHog in prod).
 *
 * The fallback is intentionally plain HTML so it can't itself throw if the
 * failure was in one of the enhanced island layers.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {hasError: false}

  static getDerivedStateFromError(): State {
    return {hasError: true}
  }

  componentDidCatch(error: unknown, info: {componentStack?: string | null}) {
    logError('[web] uncaught render error', error, {componentStack: info.componentStack})
  }

  private reset = () => this.setState({hasError: false})

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback !== undefined) return this.props.fallback

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          gap: '1rem',
          minHeight: '200px',
        }}
      >
        <p style={{fontWeight: 600, fontSize: '1.1rem'}}>Something went wrong</p>
        <button
          onClick={this.reset}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: '999px',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    )
  }
}
