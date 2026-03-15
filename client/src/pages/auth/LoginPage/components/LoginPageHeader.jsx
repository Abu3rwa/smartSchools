import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import { selectAppName } from '../../../../store/slices/uiSlice';

const LoginPageHeader = ({ onBack }) => {
    const { t } = useTranslation(['auth']);
    const appName = useSelector(selectAppName);

    return (
        <header className="login-header">
            <button type="button" className="login-back" onClick={onBack}>
                <HiOutlineArrowLeft size={16} />
                {t('auth:login.header.allSchools')}
            </button>
            <span className="login-powered">{t('auth:login.header.poweredBy', { appName })}</span>
        </header>
    );
};

export default LoginPageHeader;
