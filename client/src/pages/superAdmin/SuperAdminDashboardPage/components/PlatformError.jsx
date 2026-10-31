import { useTranslation } from 'react-i18next';

export default function PlatformError({ message, onRetry }) {
    const { t } = useTranslation(['superAdminDashboard']);

    return (
        <div className="platform-panel platform-error" role="alert">
            <div>
                <h2 className="platform-panel-title">{t('superAdminDashboard:error.title')}</h2>
                <p className="platform-error-message">{message}</p>
            </div>
            <button type="button" className="platform-error-retry" onClick={onRetry}>
                {t('superAdminDashboard:error.retry')}
            </button>
        </div>
    );
}
