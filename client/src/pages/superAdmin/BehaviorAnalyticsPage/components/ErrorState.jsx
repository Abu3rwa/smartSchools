import { HiOutlineExclamation } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const ErrorState = ({ error, onRetry }) => {
    const { t } = useTranslation(['behaviorAnalytics']);

    return (
        <div className="behavior-analytics-error">
            <HiOutlineExclamation size={48} />
            <h3>{t('behaviorAnalytics:error.title')}</h3>
            <p>{error || t('behaviorAnalytics:error.defaultMessage')}</p>
            <button onClick={onRetry} className="btn btn-primary">
                {t('behaviorAnalytics:actions.retry')}
            </button>
        </div>
    );
};

export default ErrorState;
