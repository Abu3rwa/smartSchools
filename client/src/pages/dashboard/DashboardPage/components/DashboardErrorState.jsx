import { useTranslation } from 'react-i18next';

const DashboardErrorState = ({ error, onRetry }) => {
    const { t } = useTranslation(['dashboard']);

    return (
        <div className="dashboard-page">
            <div className="error-container">
                <p className="error-message">{t('dashboard:errorState.message', { error })}</p>
                <button className="btn btn-primary" onClick={onRetry}>
                    {t('dashboard:errorState.retry')}
                </button>
            </div>
        </div>
    );
};

export default DashboardErrorState;
