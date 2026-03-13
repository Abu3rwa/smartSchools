import React from 'react';
import { useTranslation } from 'react-i18next';

const LoginContact = ({ adminEmail }) => {
    const { t } = useTranslation(['auth']);

    if (!adminEmail) return null;
    return (
        <p className="login-contact">
            {t('auth:login.contact.needHelp')} <a href={`mailto:${adminEmail}`}>{t('auth:login.contact.contactSchool')}</a>
        </p>
    );
};

export default LoginContact;
