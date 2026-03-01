const ErrorState = ({ message, validationErrors = [], className = 'import-result error' }) => {
    if (!message) return null;

    return (
        <div className={className}>
            <p>
                <strong>{message}</strong>
            </p>
            {validationErrors.length > 0 && (
                <ul style={{ fontSize: '0.82rem', marginTop: 8 }}>
                    {validationErrors.map((error, index) => (
                        <li key={index}>{error}</li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default ErrorState;
