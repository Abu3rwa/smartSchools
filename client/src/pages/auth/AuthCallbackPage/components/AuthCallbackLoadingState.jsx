import { useTranslation } from 'react-i18next';

const AuthCallbackLoadingState = () => {
    const { t } = useTranslation(['auth']);

    return (
        <div className="auth-callback-page">
            <div className="auth-callback-container">
                <div className="spinner-large"></div>
                <h2>{t('auth:authCallback.title')}</h2>
                <p>{t('auth:authCallback.subtitle')}</p>
            </div>
        </div>
    );
};

export default AuthCallbackLoadingState;
