import { useEffect, useState } from 'react';
import { HiOutlineCalendar, HiOutlineLightBulb, HiOutlineX } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const createInitialState = (objective) => ({
    reason: objective?.suggestedAction === 'intervention'
        ? 'Repeated weakness detected across linked objective evidence.'
        : 'Class objective performance indicates reteaching is needed.',
    recommendedStrategy: '',
    plannedDate: ''
});

const ReteachTaskModal = ({
    open,
    objective,
    classId,
    subjectId,
    onClose,
    onSubmit,
    saving = false
}) => {
    const { t } = useTranslation(['gradebook']);
    const [formState, setFormState] = useState(createInitialState(objective));

    useEffect(() => {
        setFormState(createInitialState(objective));
    }, [objective]);

    if (!open || !objective) return null;

    const handleSubmit = async (event) => {
        event.preventDefault();
        await onSubmit({
            class: classId,
            subject: subjectId,
            objectiveKey: objective.objectiveKey,
            objectiveName: objective.objectiveName,
            linkedLessons: Array.isArray(objective.linkedLessons) ? objective.linkedLessons : [],
            reason: String(formState.reason || '').trim(),
            recommendedStrategy: String(formState.recommendedStrategy || '').trim(),
            plannedDate: formState.plannedDate || null,
            status: 'planned'
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="reteach-task-title">
            <div className="modal reteach-task-modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header reteach-task-modal__header">
                    <div>
                        <h3 id="reteach-task-title">{t('gradebook:reteachTask.title', { defaultValue: 'Create reteach task' })}</h3>
                        <p>{objective.objectiveName}</p>
                    </div>
                    <button type="button" className="modal-close" onClick={onClose} aria-label={t('gradebook:common.close', { defaultValue: 'Close' })}>
                        <HiOutlineX size={20} />
                    </button>
                </div>

                <form className="modal-body reteach-task-modal__body" onSubmit={handleSubmit}>
                    <div className="reteach-task-modal__summary">
                        <span>{t('gradebook:reteachTask.summary.mastery', { defaultValue: 'Mastery' })}: {Number(objective.masteryRate || 0).toFixed(1)}%</span>
                        <span>{t('gradebook:reteachTask.summary.belowMastery', { defaultValue: 'Below mastery' })}: {objective.studentsBelowMastery || 0}</span>
                        <span>{t('gradebook:reteachTask.summary.action', { defaultValue: 'Suggested action' })}: {objective.suggestedAction}</span>
                    </div>

                    <label className="form-group">
                        <span>{t('gradebook:reteachTask.reason', { defaultValue: 'Reason' })}</span>
                        <textarea
                            value={formState.reason}
                            onChange={(event) => setFormState((prev) => ({ ...prev, reason: event.target.value }))}
                            rows={3}
                            required
                        />
                    </label>

                    <label className="form-group">
                        <span><HiOutlineLightBulb size={14} /> {t('gradebook:reteachTask.strategy', { defaultValue: 'Recommended strategy' })}</span>
                        <textarea
                            value={formState.recommendedStrategy}
                            onChange={(event) => setFormState((prev) => ({ ...prev, recommendedStrategy: event.target.value }))}
                            rows={3}
                            placeholder={t('gradebook:reteachTask.strategyPlaceholder', { defaultValue: 'Example: small-group modeling, error analysis, and one follow-up check.' })}
                        />
                    </label>

                    <label className="form-group">
                        <span><HiOutlineCalendar size={14} /> {t('gradebook:reteachTask.plannedDate', { defaultValue: 'Planned date' })}</span>
                        <input
                            type="date"
                            value={formState.plannedDate}
                            onChange={(event) => setFormState((prev) => ({ ...prev, plannedDate: event.target.value }))}
                        />
                    </label>

                    <div className="modal-footer reteach-task-modal__footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                            {t('gradebook:common.cancel', { defaultValue: 'Cancel' })}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving || !String(formState.reason || '').trim()}>
                            {saving
                                ? t('gradebook:reteachTask.creating', { defaultValue: 'Creating...' })
                                : t('gradebook:reteachTask.create', { defaultValue: 'Create task' })}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ReteachTaskModal;