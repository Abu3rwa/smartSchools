import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineAcademicCap } from 'react-icons/hi';

const LoginLogo = ({ isSchoolContext, schoolName }) => {
    const { t } = useTranslation(['auth']);

    return (
        <div className="login-logo">
            <div className="logo-icon-lg">
                <img src="/logo.svg" alt="Logo" width={64} height={64} style={{ display: 'block', margin: '0 auto' }} />
            </div>
            <h1 className="logo-title">{isSchoolContext ? schoolName : t('auth:login.logo.defaultSchoolName')}</h1>
            <p className="logo-subtitle">{t('auth:login.logo.subtitle')}</p>
        </div>
    );
};

export default LoginLogo;
