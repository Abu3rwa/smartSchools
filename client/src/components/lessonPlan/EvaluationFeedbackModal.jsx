import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

const formatDateTime = (value) => {
  if (!value) return '';
  try {
    return format(new Date(value), 'MMM d, yyyy h:mm a');
  } catch (_) {
    return '';
  }
};

const EvaluationFeedbackModal = ({
  open,
  onClose,
  lesson,
  historyData,
  loading,
  reevaluating,
  onReevaluate,
  errorMessage
}) => {
  const { t } = useTranslation(['lessonPlan']);
  if (!open) return null;

  const evaluation = historyData?.currentEvaluation || lesson?.aiEvaluation || null;
  const history = Array.isArray(historyData?.history) ? historyData.history : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('lessonPlan:evaluation.title')}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body evaluation-modal-body">
          <div className="evaluation-modal-toolbar">
            <div>
              <div className="evaluation-modal-title">{lesson?.title || t('lessonPlan:evaluation.lessonFallback')}</div>
              {evaluation?.evaluatedAt && (
                <div className="text-muted">
                  {t('lessonPlan:evaluation.lastEvaluated')}: {formatDateTime(evaluation.evaluatedAt)}
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onReevaluate({ forceReevaluate: true })}
              disabled={reevaluating}
            >
              {reevaluating ? (
                <>
                  <span className="spinner-small" />
                  {t('lessonPlan:evaluation.reEvaluating')}
                </>
              ) : (
                t('lessonPlan:evaluation.reEvaluate')
              )}
            </button>
          </div>

          {historyData?.isStaleComparedToCurrentCriteria && (
            <div className="evaluation-stale-banner">
              {t('lessonPlan:evaluation.staleNotice')}
            </div>
          )}

          {errorMessage && <div className="error-message">{errorMessage}</div>}

          {loading ? (
            <div className="loading-container" style={{ minHeight: '120px' }}>
              <div className="spinner" />
            </div>
          ) : !evaluation ? (
            <div className="text-muted">{t('lessonPlan:evaluation.empty')}</div>
          ) : (
            <>
              <div className="evaluation-summary-row">
                <div className="evaluation-summary-card">
                  <span className="text-muted">{t('lessonPlan:evaluation.overallScore')}</span>
                  <strong>{evaluation.overallScore ?? 0}/100</strong>
                </div>
                <div className="evaluation-summary-card">
                  <span className="text-muted">{t('lessonPlan:evaluation.minimumRequirements')}</span>
                  <strong>
                    {evaluation.meetsMinimumRequirements
                      ? t('lessonPlan:evaluation.met')
                      : t('lessonPlan:evaluation.notMet')}
                  </strong>
                </div>
              </div>

              <div className="evaluation-section">
                <h4>{t('lessonPlan:evaluation.criteriaFeedback')}</h4>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('lessonPlan:evaluation.table.criterion')}</th>
                        <th>{t('lessonPlan:evaluation.table.score')}</th>
                        <th>{t('lessonPlan:evaluation.table.met')}</th>
                        <th>{t('lessonPlan:evaluation.table.feedback')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(evaluation.criteriaScores || []).map((row, index) => (
                        <tr key={`${row.criteriaName}-${index}`}>
                          <td>{row.criteriaName || t('lessonPlan:evaluation.table.criterionFallback')}</td>
                          <td>{row.score ?? 0}</td>
                          <td>{row.metMinimum ? t('lessonPlan:evaluation.table.yes') : t('lessonPlan:evaluation.table.no')}</td>
                          <td>{row.feedback || t('lessonPlan:common.emptySymbol')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="evaluation-grid-two">
                <div className="evaluation-section">
                  <h4>{t('lessonPlan:evaluation.strengths')}</h4>
                  <ul>
                    {(evaluation.strengths || []).map((item, index) => (
                      <li key={`strength-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="evaluation-section">
                  <h4>{t('lessonPlan:evaluation.areasForImprovement')}</h4>
                  <ul>
                    {(evaluation.areasForImprovement || []).map((item, index) => (
                      <li key={`improve-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="evaluation-section">
                <h4>{t('lessonPlan:evaluation.recommendations')}</h4>
                <ul>
                  {(evaluation.recommendations || []).map((item, index) => (
                    <li key={`recommendation-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="evaluation-section">
                <h4>{t('lessonPlan:evaluation.history')}</h4>
                {history.length === 0 ? (
                  <div className="text-muted">{t('lessonPlan:evaluation.historyEmpty')}</div>
                ) : (
                  <div className="evaluation-history-list">
                    {history.map((entry) => (
                      <div key={entry.evaluationId || entry.evaluatedAt} className="evaluation-history-item">
                        <div>
                          <strong>{entry.overallScore ?? 0}/100</strong>
                          <span className="text-muted">
                            {' '}
                            · {entry.meetsMinimumRequirements ? t('lessonPlan:evaluation.met') : t('lessonPlan:evaluation.notMet')}
                          </span>
                        </div>
                        <div className="text-muted">{formatDateTime(entry.evaluatedAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('lessonPlan:teacherForm.actions.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

EvaluationFeedbackModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  lesson: PropTypes.object,
  historyData: PropTypes.object,
  loading: PropTypes.bool,
  reevaluating: PropTypes.bool,
  onReevaluate: PropTypes.func.isRequired,
  errorMessage: PropTypes.string
};

EvaluationFeedbackModal.defaultProps = {
  lesson: null,
  historyData: null,
  loading: false,
  reevaluating: false,
  errorMessage: ''
};

export default EvaluationFeedbackModal;
