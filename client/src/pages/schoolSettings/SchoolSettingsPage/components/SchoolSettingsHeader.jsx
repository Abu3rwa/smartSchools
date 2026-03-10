import { useTranslation } from 'react-i18next';

const SchoolSettingsHeader = () => {
  const { t } = useTranslation(['schoolSettings']);

  return (
    <div className="page-header">
      <div>
        <h1>{t('schoolSettings:header.title')}</h1>
        <p className="text-muted">{t('schoolSettings:header.subtitle')}</p>
      </div>
    </div>
  );
};

export default SchoolSettingsHeader;
