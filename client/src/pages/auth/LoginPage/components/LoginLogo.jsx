import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { selectAppName } from '../../../../store/slices/uiSlice';

const LoginLogo = ({ isSchoolContext, schoolName }) => {
    const { t } = useTranslation(['auth']);
    const appName = useSelector(selectAppName);

    return (
        <div className="login-logo">
            <div className="logo-icon-lg">
                <img src="/logo.svg" alt="Logo" width={64} height={64} style={{ display: 'block', margin: '0 auto' }} />
            </div>
            <h1 className="logo-title">{isSchoolContext ? schoolName : (appName || t('auth:login.logo.defaultSchoolName'))}</h1>
            <p className="logo-subtitle">{t('auth:login.logo.subtitle')}</p>
        </div>
    );
};

export default LoginLogo;
