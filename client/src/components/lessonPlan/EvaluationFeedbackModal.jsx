import PropTypes from 'prop-types';
import { format } from 'date-fns';

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return format(new Date(value), 'MMM d, yyyy h:mm a');
  } catch (_) {
    return '—';
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
  if (!open) return null;

  const evaluation = historyData?.currentEvaluation || lesson?.aiEvaluation || null;
  const history = Array.isArray(historyData?.history) ? historyData.history : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>AI Evaluation</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body evaluation-modal-body">
          <div className="evaluation-modal-toolbar">
            <div>
              <div className="evaluation-modal-title">{lesson?.title || 'Lesson plan'}</div>
              {evaluation?.evaluatedAt && (
                <div className="text-muted">Last evaluated: {formatDateTime(evaluation.evaluatedAt)}</div>
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
                  Re-evaluating...
                </>
              ) : (
                'Re-evaluate'
              )}
            </button>
          </div>

          {historyData?.isStaleComparedToCurrentCriteria && (
            <div className="evaluation-stale-banner">
              Criteria changed since this evaluation. Re-evaluate to refresh feedback.
            </div>
          )}

          {errorMessage && <div className="error-message">{errorMessage}</div>}

          {loading ? (
            <div className="loading-container" style={{ minHeight: '120px' }}>
              <div className="spinner" />
            </div>
          ) : !evaluation ? (
            <div className="text-muted">No AI evaluation found for this lesson plan.</div>
          ) : (
            <>
              <div className="evaluation-summary-row">
                <div className="evaluation-summary-card">
                  <span className="text-muted">Overall score</span>
                  <strong>{evaluation.overallScore ?? 0}/100</strong>
                </div>
                <div className="evaluation-summary-card">
                  <span className="text-muted">Minimum requirements</span>
                  <strong>
                    {evaluation.meetsMinimumRequirements ? 'Met' : 'Not met'}
                  </strong>
                </div>
              </div>

              <div className="evaluation-section">
                <h4>Criteria Feedback</h4>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Criterion</th>
                        <th>Score</th>
                        <th>Met</th>
                        <th>Feedback</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(evaluation.criteriaScores || []).map((row, index) => (
                        <tr key={`${row.criteriaName}-${index}`}>
                          <td>{row.criteriaName || 'Criterion'}</td>
                          <td>{row.score ?? 0}</td>
                          <td>{row.metMinimum ? 'Yes' : 'No'}</td>
                          <td>{row.feedback || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="evaluation-grid-two">
                <div className="evaluation-section">
                  <h4>Strengths</h4>
                  <ul>
                    {(evaluation.strengths || []).map((item, index) => (
                      <li key={`strength-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="evaluation-section">
                  <h4>Areas for Improvement</h4>
                  <ul>
                    {(evaluation.areasForImprovement || []).map((item, index) => (
                      <li key={`improve-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="evaluation-section">
                <h4>Recommendations</h4>
                <ul>
                  {(evaluation.recommendations || []).map((item, index) => (
                    <li key={`recommendation-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="evaluation-section">
                <h4>History</h4>
                {history.length === 0 ? (
                  <div className="text-muted">No evaluation history available yet.</div>
                ) : (
                  <div className="evaluation-history-list">
                    {history.map((entry) => (
                      <div key={entry.evaluationId || entry.evaluatedAt} className="evaluation-history-item">
                        <div>
                          <strong>{entry.overallScore ?? 0}/100</strong>
                          <span className="text-muted"> · {entry.meetsMinimumRequirements ? 'Met' : 'Not met'}</span>
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
            Close
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
