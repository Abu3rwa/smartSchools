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
                        <li key={index}>
                            {typeof error === 'string'
                                ? error
                                : `${error.row ? `Row ${error.row}: ` : ''}${error.data?.code ? `${error.data.code}: ` : ''}${error.field ? `${error.field} — ` : ''}${error.message || JSON.stringify(error)}`}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default ErrorState;
