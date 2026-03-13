import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowLeft } from 'react-icons/hi';

const LoginPageHeader = ({ onBack }) => {
    const { t } = useTranslation(['auth']);

    return (
        <header className="login-header">
            <button type="button" className="login-back" onClick={onBack}>
                <HiOutlineArrowLeft size={16} />
                {t('auth:login.header.allSchools')}
            </button>
            <span className="login-powered">{t('auth:login.header.poweredBy')}</span>
        </header>
    );
};

export default LoginPageHeader;
