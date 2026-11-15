import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineExclamationCircle } from 'react-icons/hi';

const LoginErrorBanner = ({ code, onDismiss }) => {
    const { t } = useTranslation(['auth']);

    if (!code) return null;
    const key = `auth:login.errors.${code}`;
    const message = t(key, { defaultValue: t('auth:login.errors.generic') });

    return (
        <div className="login-alert" role="alert">
            <HiOutlineExclamationCircle size={18} />
            <span>{message}</span>
            {onDismiss && (
                <button type="button" className="login-alert-dismiss" onClick={onDismiss} aria-label={t('auth:login.errors.dismiss')}>
                    &times;
                </button>
            )}
        </div>
    );
};

export default LoginErrorBanner;
