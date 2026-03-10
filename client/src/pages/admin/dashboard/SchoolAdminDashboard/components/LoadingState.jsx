import { useTranslation } from 'react-i18next';

/**
 * Full-page loading state for School Admin Dashboard.
 * Uses existing CSS classes: admin-dashboard-page, loading-container, spinner.
 */
export default function LoadingState() {
    const { t } = useTranslation(['adminDashboard']);

    return (
        <div className="admin-dashboard-page">
            <div className="loading-container">
                <div className="spinner"></div>
                <p>{t('adminDashboard:loading.message')}</p>
            </div>
        </div>
    );
}
