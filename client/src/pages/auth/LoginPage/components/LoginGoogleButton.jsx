import React from 'react';
import { useTranslation } from 'react-i18next';
import GoogleIcon from './GoogleIcon';

const LoginGoogleButton = ({ handleGoogleLogin, loading, disabled = false }) => {
    const { t } = useTranslation(['auth']);

    return (
        <button
            type="button"
            className="btn btn-outline btn-lg w-full google-btn"
            onClick={handleGoogleLogin}
            disabled={loading || disabled}
        >
            {loading ? (
                <span className="btn-loading">
                    <span className="spinner" style={{ width: 20, height: 20 }} />
                    {t('auth:login.google.signingIn')}
                </span>
            ) : (
                <>
                    <GoogleIcon />
                    {t('auth:login.google.continue')}
                </>
            )}
        </button>
    );
};

export default LoginGoogleButton;
