import { HiOutlineRefresh } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const formatDate = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString();
};

const STATUS_OPTIONS = ['planned', 'in_progress', 'completed', 'cancelled'];

const ReteachTasksPanel = ({
    tasks,
    loading,
    error,
    saving,
    onRefresh,
    onStatusChange
}) => {
    const { t } = useTranslation(['gradebook']);

    return (
        <section className="card reteach-tasks-panel">
            <div className="reteach-tasks-panel__header">
                <div>
                    <h3>{t('gradebook:reteachTasks.title', { defaultValue: 'Reteach tasks' })}</h3>
                    <p>{t('gradebook:reteachTasks.subtitle', { defaultValue: 'Track planned follow-up for weak objectives in this class view.' })}</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={loading || saving}>
                    <HiOutlineRefresh size={16} />
                    <span>{t('gradebook:reteachTasks.refresh', { defaultValue: 'Refresh' })}</span>
                </button>
            </div>

            {loading && <div className="reteach-tasks-panel__empty">{t('gradebook:reteachTasks.loading', { defaultValue: 'Loading reteach tasks...' })}</div>}
            {!loading && error && <div className="reteach-tasks-panel__empty reteach-tasks-panel__empty--error">{error}</div>}
            {!loading && !error && (!Array.isArray(tasks) || tasks.length === 0) && (
                <div className="reteach-tasks-panel__empty">{t('gradebook:reteachTasks.empty', { defaultValue: 'No reteach tasks have been created for this class and subject yet.' })}</div>
            )}

            {!loading && !error && Array.isArray(tasks) && tasks.length > 0 && (
                <div className="reteach-task-list">
                    {tasks.map((task) => (
                        <article key={task._id} className="reteach-task-item">
                            <div className="reteach-task-item__main">
                                <div className="reteach-task-item__top">
                                    <strong>{task.objectiveName || task.objectiveKey}</strong>
                                    <span className={`reteach-task-status reteach-task-status--${task.status || 'planned'}`}>
                                        {t(`gradebook:reteachTasks.status.${task.status}`, { defaultValue: task.status || 'planned' })}
                                    </span>
                                </div>
                                <p>{task.reason || t('gradebook:reteachTasks.noReason', { defaultValue: 'No reason provided.' })}</p>
                                <div className="reteach-task-item__meta">
                                    <span>{t('gradebook:reteachTasks.date', { defaultValue: 'Planned' })}: {formatDate(task.plannedDate) || t('gradebook:common.notSet', { defaultValue: 'Not set' })}</span>
                                    <span>{t('gradebook:reteachTasks.strategy', { defaultValue: 'Strategy' })}: {task.recommendedStrategy || t('gradebook:common.notSet', { defaultValue: 'Not set' })}</span>
                                </div>
                            </div>

                            <label className="reteach-task-item__status-control">
                                <span>{t('gradebook:reteachTasks.updateStatus', { defaultValue: 'Update status' })}</span>
                                <select
                                    value={task.status || 'planned'}
                                    onChange={(event) => onStatusChange(task._id, event.target.value)}
                                    disabled={saving}
                                >
                                    {STATUS_OPTIONS.map((status) => (
                                        <option key={status} value={status}>
                                            {t(`gradebook:reteachTasks.status.${status}`, { defaultValue: status })}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
};

export default ReteachTasksPanel;