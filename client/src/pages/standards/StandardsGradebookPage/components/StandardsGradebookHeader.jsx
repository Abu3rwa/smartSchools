import { useTranslation } from 'react-i18next';

const StandardsGradebookHeader = ({ onRefresh, loading }) => {
  const { t } = useTranslation(['standardsGradebook']);

  return (
    <div className="standards-gradebook-header">
      <div>
        <h1>{t('standardsGradebook:header.title')}</h1>
        <p>{t('standardsGradebook:header.subtitle')}</p>
      </div>
      <button
        type="button"
        className="standards-gradebook-button"
        onClick={onRefresh}
        disabled={loading}
      >
        {loading ? t('standardsGradebook:actions.loading') : t('standardsGradebook:actions.refresh')}
      </button>
    </div>
  );
};

export default StandardsGradebookHeader;
