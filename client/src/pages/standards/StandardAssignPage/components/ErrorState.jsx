const ErrorState = ({
    message,
    emptyText = '',
    retryLabel = 'Retry',
    onRetry,
    disableRetry = false
}) => {
    return (
        <div className="assign-empty" style={{ padding: 'var(--spacing-lg) 0' }}>
            <p>{message || emptyText}</p>
            {onRetry && (
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={onRetry}
                    disabled={disableRetry}
                >
                    {retryLabel}
                </button>
            )}
        </div>
    );
};

export default ErrorState;
