import { HiOutlineChartBar, HiOutlineClock, HiOutlineSparkles, HiOutlineX } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const formatDate = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString();
};

const StudentLearningTraceModal = ({
    open,
    onClose,
    student,
    trace,
    loading,
    error
}) => {
    const { t } = useTranslation(['gradebook']);

    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="learning-trace-title">
            <div className="modal academic-trace-modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header academic-trace-modal__header">
                    <div>
                        <h3 id="learning-trace-title">
                            {t('gradebook:learningTrace.title', { defaultValue: 'Learning trace' })}
                        </h3>
                        <p>
                            {student
                                ? `${student.firstName || ''} ${student.lastName || ''}`.trim()
                                : t('gradebook:learningTrace.studentFallback', { defaultValue: 'Student' })}
                        </p>
                    </div>
                    <button type="button" className="modal-close" onClick={onClose} aria-label={t('gradebook:common.close', { defaultValue: 'Close' })}>
                        <HiOutlineX size={20} />
                    </button>
                </div>

                <div className="modal-body academic-trace-modal__body">
                    {loading && (
                        <div className="academic-trace-empty">{t('gradebook:learningTrace.loading', { defaultValue: 'Loading learning trace...' })}</div>
                    )}

                    {!loading && error && (
                        <div className="academic-trace-empty academic-trace-empty--error">{error}</div>
                    )}

                    {!loading && !error && (!Array.isArray(trace) || trace.length === 0) && (
                        <div className="academic-trace-empty">
                            {t('gradebook:learningTrace.empty', { defaultValue: 'No learning trace entries were found for this selection.' })}
                        </div>
                    )}

                    {!loading && !error && Array.isArray(trace) && trace.length > 0 && (
                        <div className="academic-trace-list">
                            {trace.map((entry) => (
                                <article key={entry.gradeId} className="academic-trace-item">
                                    <div className="academic-trace-item__header">
                                        <strong>{entry.subject?.name || t('gradebook:learningTrace.subjectFallback', { defaultValue: 'Subject' })}</strong>
                                        <span>{formatDate(entry.date)}</span>
                                    </div>
                                    <div className="academic-trace-item__metrics">
                                        <span><HiOutlineChartBar size={14} /> {t('gradebook:learningTrace.score', { defaultValue: 'Score' })}: {entry.demonstratedPerformance?.score ?? '-'}%</span>
                                        <span><HiOutlineSparkles size={14} /> {t('gradebook:learningTrace.mastery', { defaultValue: 'Mastery' })}: {entry.demonstratedPerformance?.masteryLevel || '-'}</span>
                                        <span><HiOutlineClock size={14} /> {t('gradebook:learningTrace.nextStep', { defaultValue: 'Next step' })}: {entry.recommendedNextStep || '-'}</span>
                                    </div>

                                    <div className="academic-trace-item__section">
                                        <span className="academic-trace-item__label">{t('gradebook:learningTrace.objectives', { defaultValue: 'Objectives' })}</span>
                                        <p>
                                            {(entry.taughtContext?.objectives || []).map((objective) => objective.text).filter(Boolean).join(', ')
                                                || t('gradebook:learningTrace.none', { defaultValue: 'No linked objectives' })}
                                        </p>
                                    </div>

                                    <div className="academic-trace-item__section">
                                        <span className="academic-trace-item__label">{t('gradebook:learningTrace.gaps', { defaultValue: 'Gaps' })}</span>
                                        <p>
                                            {(entry.gapAnalysis?.missingSkills || []).join(', ')
                                                || t('gradebook:learningTrace.none', { defaultValue: 'No linked objectives' })}
                                        </p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StudentLearningTraceModal;