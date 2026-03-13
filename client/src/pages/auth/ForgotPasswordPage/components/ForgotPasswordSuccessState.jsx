import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const ForgotPasswordSuccessState = ({ email, onSendAnotherLink }) => {
    const { t } = useTranslation(['auth']);

    return (
        <div className="success-message">
            <h2>{t('auth:forgotPassword.success.title')}</h2>
            <p>
                {t('auth:forgotPassword.success.message', { email })}
            </p>
            <p>
                {t('auth:forgotPassword.success.expiryNote')}
            </p>
            <div className="success-actions">
                <button className="btn btn-secondary" onClick={onSendAnotherLink}>
                    {t('auth:forgotPassword.success.sendAnotherLink')}
                </button>
                <Link to="/login" className="btn btn-primary">
                    {t('auth:forgotPassword.success.backToLogin')}
                </Link>
            </div>
        </div>
    );
};

export default ForgotPasswordSuccessState;
