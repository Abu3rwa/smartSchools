import { useTranslation } from 'react-i18next';

/**
 * Inline error panel with retry. The page frame stays visible.
 */
export default function ErrorState({ message, onRetry }) {
    const { t } = useTranslation(['adminDashboard']);

    return (
        <div className="admin-panel admin-error" role="alert">
            <p className="admin-error-message">
                {t('adminDashboard:error.message', { message })}
            </p>
            <button type="button" className="admin-error-retry" onClick={onRetry}>
                {t('adminDashboard:error.retry')}
            </button>
        </div>
    );
}
