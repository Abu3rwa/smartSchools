import { useTranslation } from 'react-i18next';

const ErrorState = ({
    message,
    emptyText = '',
    retryLabel,
    onRetry,
    disableRetry = false
}) => {
    const { t } = useTranslation(['standardAssign']);

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
                    {retryLabel || t('standardAssign:actions.retry')}
                </button>
            )}
        </div>
    );
};

export default ErrorState;
