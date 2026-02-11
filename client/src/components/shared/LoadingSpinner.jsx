/**
 * Reusable loading spinner with optional message.
 *
 * Usage:
 *   <LoadingSpinner />
 *   <LoadingSpinner message="Loading students..." />
 *   <LoadingSpinner size="sm" />
 */
const LoadingSpinner = ({ message, size = 'md' }) => {
    const sizeMap = { sm: 24, md: 40, lg: 56 };
    const px = sizeMap[size] || sizeMap.md;

    return (
        <div className="shared-loading" style={{ textAlign: 'center', padding: 'var(--spacing-2xl) var(--spacing-md)' }}>
            <div
                className="spinner"
                style={{ width: px, height: px, margin: '0 auto var(--spacing-md)' }}
            />
            {message && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{message}</p>
            )}
        </div>
    );
};

export default LoadingSpinner;
