import { HiOutlineExclamationCircle, HiOutlineRefresh } from 'react-icons/hi';

/**
 * Reusable error banner with optional retry button.
 *
 * Usage:
 *   <ErrorBanner message="Failed to load data" />
 *   <ErrorBanner message={error} onRetry={() => dispatch(fetchData())} />
 */
const ErrorBanner = ({ message = 'Something went wrong', onRetry }) => {
    return (
        <div role="alert" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
            padding: 'var(--spacing-md) var(--spacing-lg)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--radius-md)',
            color: '#f87171',
            fontSize: '0.9rem',
            marginBottom: 'var(--spacing-lg)'
        }}>
            <HiOutlineExclamationCircle size={20} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{message}</span>
            {onRetry && (
                <button
                    onClick={onRetry}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 12px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#f87171',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                        fontWeight: 500,
                        whiteSpace: 'nowrap'
                    }}
                >
                    <HiOutlineRefresh size={14} /> Retry
                </button>
            )}
        </div>
    );
};

export default ErrorBanner;
