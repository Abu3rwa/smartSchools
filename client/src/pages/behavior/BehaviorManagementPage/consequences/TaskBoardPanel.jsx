import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { HiOutlineClipboardCheck, HiOutlineSearch } from 'react-icons/hi';
import { fetchBehaviorTasks, verifyBehaviorTask } from '../../../../api/behaviorApi';
import { TASK_TONE, formatDate, isOverdue, studentLabel } from './consequenceUtils';

const PAGE_SIZE = 25;

const FILTERS = ['open', 'submitted', 'needs_revision', 'overdue', 'completed', 'waived', 'all'];

const statusQuery = (filter) => {
    if (filter === 'all') return { limit: PAGE_SIZE };
    if (filter === 'open') return { limit: PAGE_SIZE };
    return { status: filter, limit: PAGE_SIZE };
};

const TaskCard = ({ task, filter, onVerify, busy, now }) => {
    const { t } = useTranslation(['behaviorConsequences']);
    const [expanded, setExpanded] = useState(false);
    const [comment, setComment] = useState('');

    const submitted = task.submission?.wordCount || 0;
    const minimum = task.minWords || 0;
    const short = minimum > 0 && submitted < minimum;
    const overdue = isOverdue(task.dueAt, task.status, now);
    const progress = minimum > 0 ? Math.min(100, Math.round((submitted / minimum) * 100)) : 100;

    const act = async (decision) => {
        if (decision === 'needs_revision' && !comment.trim()) {
            toast.error(t('tasks.revisionCommentRequired'));
            return;
        }
        await onVerify(task, decision, comment.trim());
        setComment('');
    };

    return (
        <div className="bc-list-item">
            <div>
                <p className="bc-item-title">{task.title}</p>
                <p className="bc-item-sub">
                    {studentLabel(task.student)} · {task.behaviorType?.name || t('common.unknownBehavior')}
                    {' · '}{t(`taskTypes.${task.taskType}`)}
                </p>
                <p className={`bc-item-sub ${overdue ? 'text-danger' : ''}`}>
                    {task.dueAt
                        ? t('tasks.due', { date: formatDate(task.dueAt) })
                        : t('tasks.noDueDate')}
                    {task.requiresReturnClearance ? ` · ${t('tasks.gatesReturn')}` : ''}
                </p>
                {task.instructions && expanded && (
                    <p className="bc-item-sub">{task.instructions}</p>
                )}
                {expanded && task.questions?.length > 0 && (
                    <ul className="bc-consequence-list">
                        {task.questions.map((question) => (
                            <li key={question}>{question}</li>
                        ))}
                    </ul>
                )}
                {expanded && task.submission?.text && (
                    <div className="bc-email-preview">
                        <p className="bc-email-body">{task.submission.text}</p>
                    </div>
                )}
                {expanded && task.submission?.answers?.length > 0 && (
                    <div className="bc-audit">
                        {task.submission.answers.map((answer, index) => (
                            <div className="bc-audit-row" key={`${answer.question}-${index}`}>
                                <span>{answer.question}</span>
                                <span>{answer.answer}</span>
                            </div>
                        ))}
                    </div>
                )}
                {task.revisionComment && expanded && (
                    <p className="bc-item-sub text-warning">{t('tasks.lastRevision')}: {task.revisionComment}</p>
                )}
            </div>

            <div className="bc-item-side">
                <div className="bc-badges">
                    <span className={`badge badge-${TASK_TONE[task.status] || 'secondary'}`}>
                        {t(`taskStatuses.${task.status}`)}
                    </span>
                    {minimum > 0 && (
                        <span className={`badge ${short ? 'badge-warning' : 'badge-success'}`}>
                            {t('tasks.words', { value: submitted, min: minimum })}
                        </span>
                    )}
                </div>

                {minimum > 0 && (
                    <div className={`bc-meter ${short ? 'is-over' : ''}`} style={{ width: '7rem' }}>
                        <span style={{ width: `${progress}%` }} />
                    </div>
                )}

                <div className="bc-actions">
                    <button
                        type="button"
                        className="bc-icon-btn"
                        onClick={() => setExpanded((prev) => !prev)}
                        aria-expanded={expanded}
                    >
                        <HiOutlineSearch /> {expanded ? t('common.collapse') : t('common.expand')}
                    </button>
                    {task.status !== 'completed' && (
                        <button type="button" className="btn btn-sm btn-success" onClick={() => act('completed')} disabled={busy}>
                            <HiOutlineClipboardCheck /> {t('tasks.complete')}
                        </button>
                    )}
                    {task.status !== 'needs_revision' && (
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => act('needs_revision')} disabled={busy}>
                            {t('tasks.requestRevision')}
                        </button>
                    )}
                    {task.status !== 'waived' && (
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => act('waived')} disabled={busy}>
                            {t('tasks.waive')}
                        </button>
                    )}
                </div>

                {(filter !== 'completed' || task.status === 'needs_revision') && (
                    <input
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        placeholder={t('tasks.commentPlaceholder')}
                        maxLength={1000}
                        style={{ width: '100%', marginTop: '0.35rem' }}
                    />
                )}
            </div>
        </div>
    );
};

const TaskBoardPanel = ({ onCountChange }) => {
    const { t } = useTranslation(['behaviorConsequences']);
    const [filter, setFilter] = useState('open');
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [skip, setSkip] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    // Captured per fetch so overdue flags stay stable across re-renders.
    const [now, setNow] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError('');
            try {
                const payload = await fetchBehaviorTasks({ ...statusQuery(filter), skip });
                if (cancelled) return;
                const rows = payload?.items || [];
                setItems(rows);
                setTotal(payload?.pagination?.total ?? 0);
                setNow(Date.now());
                if (filter === 'open') {
                    onCountChange?.(rows.filter((task) => task.status === 'submitted').length);
                }
            } catch (loadError) {
                if (!cancelled) setError(loadError?.response?.data?.message || t('tasks.loadFailed'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [filter, skip, reload, onCountChange, t]);

    const verify = async (task, decision, comment) => {
        try {
            await verifyBehaviorTask(task._id, { decision, comment: comment || undefined });
            toast.success(t('tasks.verifiedToast', { decision: t(`verify.${decision}`) }));
            setReload((value) => value + 1);
        } catch (verifyError) {
            toast.error(verifyError?.response?.data?.message || t('tasks.verifyFailed'));
        }
    };

    return (
        <div className="bc-panel">
            <div className="bc-panel-head">
                <div>
                    <h2>{t('tasks.title')}</h2>
                    <p>{t('tasks.subtitle')}</p>
                </div>
                <span className="badge badge-secondary">{t('tasks.count', { value: total })}</span>
            </div>

            <div className="bc-chips" style={{ marginBottom: 'var(--spacing-md)' }}>
                {FILTERS.map((key) => (
                    <button
                        type="button"
                        key={key}
                        className={`bc-chip ${filter === key ? 'is-on' : ''}`}
                        onClick={() => { setFilter(key); setSkip(0); }}
                    >
                        {t(`filters.${key}`)}
                    </button>
                ))}
            </div>

            {loading && <div className="bc-loading">{t('common.loading')}</div>}
            {!loading && error && (
                <div className="bc-error">
                    {error} <button type="button" className="btn btn-sm btn-secondary" onClick={() => setReload((value) => value + 1)}>{t('common.retry')}</button>
                </div>
            )}

            {!loading && !error && !items.length && (
                <div className="bc-empty">
                    <HiOutlineClipboardCheck />
                    <h3>{t('tasks.emptyTitle')}</h3>
                    <p>{t('tasks.emptyBody')}</p>
                </div>
            )}

            {!loading && !error && items.length > 0 && (
                <>
                    <div className="bc-list">
                        {items.map((task) => (
                            <TaskCard key={task._id} task={task} filter={filter} now={now} onVerify={verify} busy={loading} />
                        ))}
                    </div>
                    <div className="bc-pagination">
                        <span>{t('common.showing', { from: skip + 1, to: Math.min(skip + items.length, total), total })}</span>
                        <div className="bc-actions">
                            <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => setSkip(Math.max(skip - PAGE_SIZE, 0))}
                                disabled={skip === 0}
                            >
                                {t('common.previous')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => setSkip(skip + PAGE_SIZE)}
                                disabled={skip + PAGE_SIZE >= total}
                            >
                                {t('common.next')}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default TaskBoardPanel;
