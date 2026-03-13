import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const ForgotPasswordForm = ({ email, loading, onEmailChange, onSubmit }) => {
    const { t } = useTranslation(['auth']);

    return (
        <div className="forgot-password-form">
            <h2>{t('auth:forgotPassword.title')}</h2>
            <p>
                {t('auth:forgotPassword.description')}
            </p>

            <form onSubmit={onSubmit}>
                <div className="form-group">
                    <label htmlFor="email">{t('auth:forgotPassword.emailLabel')}</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(event) => onEmailChange(event.target.value)}
                        placeholder={t('auth:forgotPassword.emailPlaceholder')}
                        required
                        disabled={loading}
                    />
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                    {loading ? t('auth:forgotPassword.sending') : t('auth:forgotPassword.sendLink')}
                </button>
            </form>

            <div className="back-to-login">
                <Link to="/login">{`← ${t('auth:forgotPassword.backToLogin')}`}</Link>
            </div>
        </div>
    );
};

export default ForgotPasswordForm;
