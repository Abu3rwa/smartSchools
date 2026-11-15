import React from 'react';
import { useTranslation } from 'react-i18next';

const SettingsPageHeader = () => {
    const { t } = useTranslation(['settings']);

    return (
        <div className="page-header settings-header">
            <div>
                <h1>{t('settings:page.title')}</h1>
                <p className="text-muted">{t('settings:page.subtitle')}</p>
            </div>
        </div>
    );
};

export default SettingsPageHeader;
