import { useTranslation } from 'react-i18next';

const GoogleFormResultsPanel = ({ results, loading, onClose, onSync }) => {
    const { t } = useTranslation(['assignments']);
    if (!results) return null;

    return (
        <section className="card google-form-results-panel" aria-labelledby="google-form-results-title">
            <div className="card-header">
                <h3 className="card-title" id="google-form-results-title">
                    {t('assignments:googleForms.resultsTitle', { title: results.assignment.title })}
                </h3>
                <div>
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={loading}
                        onClick={() => onSync(results.assignment)}
                    >
                        {loading ? t('assignments:googleForms.syncing') : t('assignments:googleForms.sync')}
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
                        {t('assignments:common.close')}
                    </button>
                </div>
            </div>
            {loading ? (
                <div className="loading-state">{t('assignments:googleForms.loadingResults')}</div>
            ) : results.items.length === 0 ? (
                <div className="empty-state">{t('assignments:googleForms.noResponses')}</div>
            ) : (
                <div className="table-container">
                    <table className="assignment-table">
                        <thead>
                            <tr>
                                <th>{t('assignments:googleForms.student')}</th>
                                <th>{t('assignments:googleForms.submittedAt')}</th>
                                <th>{t('assignments:googleForms.score')}</th>
                                <th>{t('assignments:googleForms.answers')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.items.map((item) => (
                                <tr key={item.id}>
                                    <td>{item.student.name || item.student.studentId}</td>
                                    <td>
                                        {new Date(item.submittedAt).toLocaleString()}
                                        {item.status === 'late' ? ` (${t('assignments:googleForms.late')})` : ''}
                                    </td>
                                    <td>
                                        {item.score === null
                                            ? t('assignments:googleForms.manualReview')
                                            : `${item.score} / ${item.possibleScore ?? '?'}`}
                                    </td>
                                    <td>
                                        <details>
                                            <summary>{t('assignments:googleForms.viewAnswers')}</summary>
                                            <ul>
                                                {item.answers.map((answer) => (
                                                    <li key={answer.questionId}>
                                                        <strong>{answer.question}</strong>
                                                        <span>{answer.values.join(', ') || t('assignments:common.empty')}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </details>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
};

export default GoogleFormResultsPanel;
