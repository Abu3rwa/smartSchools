import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectSBGradebookMatrixScoringMode } from '../../../../store/slices/standardSlice';

const MODE_LABEL_KEYS = {
  average: 'scoringModes.average',
  latest: 'scoringModes.latest',
  highest: 'scoringModes.highest',
};

const StandardsGradebookHeader = ({ onRefresh, loading, embedded = false }) => {
  const { t } = useTranslation(['standardsGradebook']);
  const scoringMode = useSelector(selectSBGradebookMatrixScoringMode);
  const modeLabel = t(
    `standardsGradebook:${MODE_LABEL_KEYS[scoringMode] || MODE_LABEL_KEYS.average}`,
    'Average',
  );
  const scoringText = t('standardsGradebook:header.scoring', {
    mode: modeLabel,
    defaultValue: 'Scoring: {{mode}}',
  });
  const scoringHint = t(
    'standardsGradebook:header.scoringHint',
    'How multiple assessments for the same standard are combined. Change it in School Settings.',
  );

  if (embedded) {
    return (
      <div className="standards-gradebook-header standards-gradebook-header--embedded">
        <span className="sb-scoring-mode-badge" title={scoringHint}>
          {scoringText}
        </span>
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
  }

  return (
    <div className="standards-gradebook-header">
      <div>
        <h1>
          {t('standardsGradebook:header.title')}
          <span className="sb-scoring-mode-badge" title={scoringHint}>
            {scoringText}
          </span>
        </h1>
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
