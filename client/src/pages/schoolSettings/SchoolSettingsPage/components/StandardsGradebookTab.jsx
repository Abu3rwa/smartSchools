import { useTranslation } from 'react-i18next';

const StandardsGradebookTab = ({ settings, loading, saving, onChange, onSave }) => {
  const { t } = useTranslation(['schoolSettings']);

  return (
    <div className="card admissions-promotion-settings-card">
      <div className="tab-header">
        <div>
          <h3>{t('schoolSettings:standardsGradebook.title', 'Standards Gradebook Settings')}</h3>
          <span>{t('schoolSettings:standardsGradebook.helpText', 'Configure how student scores are aggregated when they have multiple assessment entries for the same standard.')}</span>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">{t('schoolSettings:standardsGradebook.loading', 'Loading settings...')}</p>
      ) : (
        <>
          <div className="wizard-step">
            <div className="form-group">
              <label htmlFor="sb-scoring-mode">
                {t('schoolSettings:standardsGradebook.scoringModeLabel', 'Score Aggregation Mode')}
              </label>
              <select
                id="sb-scoring-mode"
                value={settings?.scoringMode || 'average'}
                onChange={(e) => onChange({ scoringMode: e.target.value })}
              >
                <option value="average">{t('schoolSettings:standardsGradebook.mode.average', 'Average — Mean of all scores')}</option>
                <option value="latest">{t('schoolSettings:standardsGradebook.mode.latest', 'Latest — Most recent assessment score')}</option>
                <option value="highest">{t('schoolSettings:standardsGradebook.mode.highest', 'Highest — Best score achieved')}</option>
              </select>
              <span className="form-hint">
                {t('schoolSettings:standardsGradebook.scoringModeHint', 'This setting controls how the Standards Gradebook matrix and table aggregate scores when a student has been assessed multiple times on the same standard.')}
              </span>
            </div>
          </div>

          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving
              ? t('schoolSettings:common.saving', 'Saving...')
              : t('schoolSettings:standardsGradebook.save', 'Save Settings')}
          </button>
        </>
      )}
    </div>
  );
};

export default StandardsGradebookTab;
