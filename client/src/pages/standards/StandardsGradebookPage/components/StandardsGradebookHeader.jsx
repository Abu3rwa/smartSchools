import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectSBGradebookMatrixScoringMode } from '../../../../store/slices/standardSlice';

const SCORING_MODE_LABELS = {
  average: 'Average',
  latest: 'Latest',
  highest: 'Highest',
};

const StandardsGradebookHeader = ({ onRefresh, loading, embedded = false }) => {
  const { t } = useTranslation(['standardsGradebook']);
  const scoringMode = useSelector(selectSBGradebookMatrixScoringMode);
  const modeLabel = SCORING_MODE_LABELS[scoringMode] || 'Average';

  if (embedded) {
    return (
      <div className="standards-gradebook-header standards-gradebook-header--embedded">
        <span className="sb-scoring-mode-badge" title="Score aggregation mode (configure in School Settings)">
          {t('standardsGradebook:header.scoring', 'Scoring')}: {modeLabel}
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
          <span className="sb-scoring-mode-badge" title="Score aggregation mode (configure in School Settings)">
            Scoring: {modeLabel}
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
