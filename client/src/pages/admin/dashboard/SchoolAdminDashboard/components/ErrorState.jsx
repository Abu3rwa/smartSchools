import { useTranslation } from 'react-i18next';

/**
 * Full-page error state for School Admin Dashboard with retry.
 * Uses existing CSS classes: admin-dashboard-page, error-container, error-message, btn, btn-primary.
 */
export default function ErrorState({ message, onRetry }) {
    const { t } = useTranslation(['adminDashboard']);

    return (
        <div className="admin-dashboard-page">
            <div className="error-container">
                <p className="error-message">{t('adminDashboard:error.message', { message })}</p>
                <button className="btn btn-primary" onClick={onRetry}>
                    {t('adminDashboard:error.retry')}
                </button>
            </div>
        </div>
    );
}
