import { useTranslation } from 'react-i18next';

const LoadingState = () => {
    const { t } = useTranslation(['behaviorAnalytics']);

    return (
        <div className="behavior-analytics-loading">
            <div className="spinner"></div>
            <p>{t('behaviorAnalytics:loading.analytics')}</p>
        </div>
    );
};

export default LoadingState;
