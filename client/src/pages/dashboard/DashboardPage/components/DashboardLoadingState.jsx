import { useTranslation } from 'react-i18next';

const DashboardLoadingState = () => {
    const { t } = useTranslation(['dashboard']);

    return (
        <div className="dashboard-page">
            <div className="loading-container">
                <div className="spinner"></div>
                <p>{t('dashboard:loadingState.message')}</p>
            </div>
        </div>
    );
};

export default DashboardLoadingState;
