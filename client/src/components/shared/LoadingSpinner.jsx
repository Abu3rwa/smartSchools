/**
 * Reusable loading spinner with optional message. Uses theme-aware shared-loading from index.css.
 *
 * Usage:
 *   <LoadingSpinner />
 *   <LoadingSpinner message="Loading students..." />
 *   <LoadingSpinner size="sm" />
 */
const LoadingSpinner = ({ message, size = 'md', className = '' }) => {
    const sizeMap = { sm: 24, md: 40, lg: 56 };
    const px = sizeMap[size] || sizeMap.md;

    return (
        <div className={`shared-loading ${className}`.trim()}>
            <div
                className="spinner"
                style={{ width: px, height: px, margin: '0 auto var(--spacing-md)' }}
            />
            {message && <p>{message}</p>}
        </div>
    );
};

export default LoadingSpinner;
