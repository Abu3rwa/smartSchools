import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console in dev; in production this would go to Sentry/etc
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: 'var(--spacing-xl, 2rem)',
            textAlign: 'center',
            color: 'var(--text-primary, #fff)',
            background: 'var(--bg-primary, #0f172a)',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', marginBottom: 'var(--spacing-md, 1rem)' }}>
            Something went wrong
          </h1>
          <p style={{ color: 'var(--text-secondary, #a0aec0)', marginBottom: 'var(--spacing-lg, 1.5rem)', maxWidth: 480 }}>
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <div style={{ display: 'flex', gap: 'var(--spacing-md, 1rem)' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 20px',
                borderRadius: 'var(--radius-md, 10px)',
                border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                background: 'var(--bg-secondary, #1e293b)',
                color: 'var(--text-primary, #fff)',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Try again
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              style={{
                padding: '8px 20px',
                borderRadius: 'var(--radius-md, 10px)',
                border: 'none',
                background: 'var(--primary, #14b8a6)',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Go to home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
