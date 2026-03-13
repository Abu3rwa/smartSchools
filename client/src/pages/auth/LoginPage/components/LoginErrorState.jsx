import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineExclamationCircle } from 'react-icons/hi';

const LoginErrorState = ({ error, onBack }) => {
    const { t } = useTranslation(['auth']);

    return (
        <div className="login-page">
            <div className="bg-gradient" />
            <div className="bg-grid" />
            <div className="login-container login-error-state">
                <div className="login-error-icon">
                    <HiOutlineExclamationCircle size={32} />
                </div>
                <h2>{t('auth:login.error.schoolNotFoundTitle')}</h2>
                <p>{error || t('auth:login.error.schoolNotFoundBody')}</p>
                <button type="button" className="btn btn-primary" onClick={onBack}>
                    {t('auth:login.error.backToHome')}
                </button>
            </div>
        </div>
    );
};

export default LoginErrorState;
