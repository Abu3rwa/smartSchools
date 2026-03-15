import {
    HiOutlineRefresh,
    HiOutlineTrendingDown,
    HiOutlineExclamationCircle,
    HiOutlineSparkles,
    HiOutlineEye,
    HiOutlineEyeOff
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const formatPercent = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : '-';
};

const AcademicInsightsPanel = ({
    loading,
    error,
    data,
    onRefresh,
    selectedSubjectName = '',
    onCreateTask,
    categoryFilter = 'All',
    visible = true,
    onToggleVisibility
}) => {
    const { t } = useTranslation(['gradebook']);

    const objectiveRows = Array.isArray(data?.objectives) ? data.objectives.slice(0, 5) : [];
    const alertCount = Array.isArray(data?.alerts) ? data.alerts.length : 0;
    const weakCount = Array.isArray(data?.objectives)
        ? data.objectives.filter((item) => item?.isWeakObjective).length
        : 0;
    const showCategoryTag = Boolean(categoryFilter && categoryFilter !== 'All');

    return (
        <section className="card academic-insights-panel">
            <div className="academic-insights-panel__header">
                <div>
                    <h3>{t('gradebook:academicInsights.title', { defaultValue: 'Academic intelligence' })}</h3>
                    <p>
                        {selectedSubjectName
                            ? t('gradebook:academicInsights.subtitleWithSubject', {
                                defaultValue: 'Objective performance for {{subject}} in the selected month.',
                                subject: selectedSubjectName
                            })
                            : t('gradebook:academicInsights.subtitle', {
                                defaultValue: 'Objective performance for the selected class view.'
                            })}
                    </p>
                    {showCategoryTag && (
                        <p className="text-muted">
                            {t('gradebook:academicInsights.filteredByCategory', {
                                defaultValue: 'Filtered by category: {{category}}',
                                category: t(`gradebook:categories.${categoryFilter}`, { defaultValue: categoryFilter })
                            })}
                        </p>
                    )}
                </div>
                <div className="academic-insights-panel__header-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onToggleVisibility}>
                        {visible ? <HiOutlineEyeOff size={16} /> : <HiOutlineEye size={16} />}
                        <span>
                            {visible
                                ? t('gradebook:academicInsights.hide', { defaultValue: 'Hide' })
                                : t('gradebook:academicInsights.show', { defaultValue: 'Show' })}
                        </span>
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={loading || !visible}>
                        <HiOutlineRefresh size={16} />
                        <span>{t('gradebook:academicInsights.refresh', { defaultValue: 'Refresh' })}</span>
                    </button>
                </div>
            </div>

            {!visible && (
                <div className="academic-insights-panel__empty">
                    {t('gradebook:academicInsights.hiddenHint', {
                        defaultValue: 'Academic intelligence is hidden to save space. Use Show to expand it.'
                    })}
                </div>
            )}

            {visible && (
                <>
                    <div className="academic-insights-panel__stats">
                        <div className="academic-insights-stat">
                            <span className="academic-insights-stat__label">{t('gradebook:academicInsights.stats.weakObjectives', { defaultValue: 'Weak objectives' })}</span>
                            <strong>{weakCount}</strong>
                        </div>
                        <div className="academic-insights-stat">
                            <span className="academic-insights-stat__label">{t('gradebook:academicInsights.stats.classAlerts', { defaultValue: 'Class alerts' })}</span>
                            <strong>{alertCount}</strong>
                        </div>
                        <div className="academic-insights-stat">
                            <span className="academic-insights-stat__label">{t('gradebook:academicInsights.stats.threshold', { defaultValue: 'Weak threshold' })}</span>
                            <strong>{formatPercent(data?.thresholds?.objectiveWeakThreshold)}</strong>
                        </div>
                    </div>

                    {loading && (
                        <div className="academic-insights-panel__empty">
                            {t('gradebook:academicInsights.loading', { defaultValue: 'Loading academic insights...' })}
                        </div>
                    )}

                    {!loading && error && (
                        <div className="academic-insights-panel__empty academic-insights-panel__empty--error">{error}</div>
                    )}

                    {!loading && !error && objectiveRows.length === 0 && (
                        <div className="academic-insights-panel__empty">
                            {t('gradebook:academicInsights.empty', {
                                defaultValue: 'No objective insights are available yet. Grades usually need linked lesson plans before objective analysis becomes useful.'
                            })}
                        </div>
                    )}

                    {!loading && !error && objectiveRows.length > 0 && (
                        <div className="academic-insights-list">
                            {objectiveRows.map((objective) => (
                                <article key={objective.objectiveKey} className="academic-insights-item">
                                    <div className="academic-insights-item__main">
                                        <div className="academic-insights-item__title-row">
                                            <strong>{objective.objectiveName}</strong>
                                            <div className="academic-insights-item__actions">
                                                <span className={`academic-insights-chip academic-insights-chip--${objective.suggestedAction || 'practice'}`}>
                                                    {t(`gradebook:academicInsights.actions.${objective.suggestedAction}`, {
                                                        defaultValue: objective.suggestedAction || 'practice'
                                                    })}
                                                </span>
                                                {objective.isWeakObjective && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => onCreateTask?.(objective)}
                                                    >
                                                        {t('gradebook:academicInsights.createTask', { defaultValue: 'Create task' })}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="academic-insights-item__meta">
                                            <span><HiOutlineTrendingDown size={14} /> {t('gradebook:academicInsights.mastery', { defaultValue: 'Mastery' })}: {formatPercent(objective.masteryRate)}</span>
                                            <span><HiOutlineExclamationCircle size={14} /> {t('gradebook:academicInsights.belowMastery', { defaultValue: 'Below mastery' })}: {objective.studentsBelowMastery || 0}/{objective.assessedStudents || 0}</span>
                                            <span><HiOutlineSparkles size={14} /> {t('gradebook:academicInsights.classWideWeak', { defaultValue: 'Class-wide weak' })}: {formatPercent(objective.classWideWeakPercent)}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    );
};

export default AcademicInsightsPanel;