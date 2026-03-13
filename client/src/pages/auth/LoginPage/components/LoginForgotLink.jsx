import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const LoginForgotLink = () => {
    const { t } = useTranslation(['auth']);

    return (
        <div className="login-forgot">
            <Link to="/forgot-password" className="forgot-password-link">
                {t('auth:login.links.forgotPassword')}
            </Link>
        </div>
    );
};

export default LoginForgotLink;
