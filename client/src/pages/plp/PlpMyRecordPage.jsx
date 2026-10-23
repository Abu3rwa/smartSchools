import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchMyPlpRecordHistory,
    fetchMyPlpRecordById,
    selectMyPlpRecord,
    selectMyPlpRecordHistory,
    selectMyPlpRecordHistoryPagination,
    selectPlpLoading,
    selectPlpError,
    clearPlpError,
} from '../../store/slices/plpSlice';
import toast from 'react-hot-toast';
import PlpPagination from './PlpPagination';
import PlpEmailConsentControl from './PlpEmailConsentControl';
import { formatPlpDate } from './plpDateUtils';
import {
    EVIDENCE_TYPE_LABELS, GOAL_STATUS_LABELS, GOAL_TYPE_LABELS, LEVEL_LABELS,
    MILESTONE_STATUS_LABELS, RECORD_STATUS_LABELS, REVIEW_OUTCOME_LABELS, TASK_STATUS_LABELS, plpLabel,
} from './plpTableLabels';
import './PLP.css';

export default function PlpMyRecordPage() {
    const dispatch = useDispatch();
    const data = useSelector(selectMyPlpRecord);
    const history = useSelector(selectMyPlpRecordHistory);
    const historyPagination = useSelector(selectMyPlpRecordHistoryPagination);
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const [selectedRecordId, setSelectedRecordId] = useState('');
    const [historyPage, setHistoryPage] = useState(1);
    const activeRecordId = history.some((item) => item._id === selectedRecordId)
        ? selectedRecordId
        : (history[0]?._id || '');

    useEffect(() => {
        dispatch(fetchMyPlpRecordHistory({ page: historyPage, limit: 50 }));
    }, [dispatch, historyPage]);

    useEffect(() => {
        if (activeRecordId) dispatch(fetchMyPlpRecordById(activeRecordId));
    }, [dispatch, activeRecordId]);

    useEffect(() => {
        if (error) {
            toast.error(error);
            dispatch(clearPlpError());
        }
    }, [error, dispatch]);

    if (loading && !data) return <div className="plp-loading">Loading your portfolio...</div>;

    if (!data?.record) {
        return (
            <div className="plp-page">
                <div className="plp-header">
                    <h1>My Portfolio</h1>
                </div>
                <PlpPagination pagination={historyPagination} onPageChange={setHistoryPage} />
                <PlpEmailConsentControl />
                <div className="plp-empty">No PLP record has been created for you yet.</div>
            </div>
        );
    }

    const { record, evidence, goals, tasks } = data;
    const openTasks = tasks.filter((task) => !['reviewed', 'completed'].includes(task.status));
    const isPastDue = (task) => Boolean(task.dueDate) && new Date(task.dueDate) < new Date() && !['reviewed', 'completed'].includes(task.status);
    const nextCheckIn = goals
        .map((goal) => goal.checkInDate || goal.targetDate)
        .filter(Boolean)
        .sort((left, right) => new Date(left) - new Date(right))[0];

    return (
        <div className="plp-page">
            <div className="plp-header">
                <div>
                    <h1>My Portfolio</h1>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
                        {record.cycle?.title || `Month ${record.month}`} · {record.academicYear}
                    </p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        <span className={`plp-badge plp-badge-${record.level}`}>{plpLabel(LEVEL_LABELS, record.level)}</span>
                        <span className={`plp-badge plp-badge-${record.status}`}>{plpLabel(RECORD_STATUS_LABELS, record.status)}</span>
                        {record.focusTrait?.name && <span className="plp-trait-progress-chip">{record.focusTrait.name}</span>}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    {history.length > 0 && (
                        <label className="plp-form-group" style={{ minWidth: 220, margin: 0 }}>
                            <span>Portfolio history</span>
                            <select value={activeRecordId} onChange={(event) => setSelectedRecordId(event.target.value)}>
                                {history.map((item) => (
                                    <option key={item._id} value={item._id}>
                                        {item.cycle?.title || `Month ${item.month}`} · {item.academicYear} · {plpLabel(RECORD_STATUS_LABELS, item.status)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
            </div>

            <div className="plp-stat-strip">
                <div className="plp-stat"><span>Positive observations</span><strong>{Number(record.evidenceCount || 0)}</strong></div>
                <div className="plp-stat"><span>Goals in progress</span><strong>{goals.filter((goal) => goal.status === 'active').length}</strong></div>
                <div className="plp-stat"><span>Tasks to do</span><strong>{openTasks.length}</strong></div>
                <div className="plp-stat"><span>Next check-in</span><strong>{nextCheckIn ? formatPlpDate(nextCheckIn) : 'Not set'}</strong></div>
            </div>

            <PlpEmailConsentControl />

            <div className="plp-section">
                <h2>My Goals</h2>
                {goals.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No goals recorded yet.</p>}
                <div style={{ display: 'grid', gap: 12 }}>
                    {goals.map((goal) => (
                        <div key={goal._id} className="plp-plan-card">
                            <div className="plp-plan-card-head">
                                <h3>{goal.title}</h3>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <span className={`plp-badge plp-badge-${goal.status}`}>{plpLabel(GOAL_STATUS_LABELS, goal.status)}</span>
                                </div>
                            </div>
                            <div className="plp-plan-meta">{plpLabel(GOAL_TYPE_LABELS, goal.goalType)}</div>
                            {goal.successCriteria && <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}><strong>What success looks like:</strong> {goal.successCriteria}</p>}
                            {goal.milestones?.length > 0 && (
                                <ul className="plp-plan-milestones">
                                    {goal.milestones.map((milestone, index) => (
                                        <li key={`${milestone.title}-${index}`}>
                                            {milestone.title} · <span className={`plp-badge plp-badge-${milestone.status}`}>{plpLabel(MILESTONE_STATUS_LABELS, milestone.status)}</span>
                                            {milestone.targetDate && <span className="plp-plan-meta"> due {formatPlpDate(milestone.targetDate)}</span>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="plp-plan-meta">
                                {goal.checkInDate && `Check-in: ${formatPlpDate(goal.checkInDate)}`}
                                {goal.reviewOutcome && `${goal.checkInDate ? ' · ' : ''}Teacher review: ${plpLabel(REVIEW_OUTCOME_LABELS, goal.reviewOutcome)}`}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="plp-section">
                <h2>My Tasks</h2>
                {tasks.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No tasks assigned yet.</p>}
                <div style={{ display: 'grid', gap: 12 }}>
                    {tasks.map((task) => (
                        <div key={task._id} className="plp-plan-card">
                            <div className="plp-plan-card-head">
                                <h3>{task.title}</h3>
                                <span className={`plp-badge plp-badge-${task.status}`}>{plpLabel(TASK_STATUS_LABELS, task.status)}</span>
                            </div>
                            <div className="plp-plan-meta">
                                {task.plpGoal?.title ? `${task.plpGoal.title} · ` : ''}
                                Due {task.dueDate ? formatPlpDate(task.dueDate) : 'not set'}
                            </div>
                            {isPastDue(task) && <span className="plp-past-due">Past due</span>}
                            {task.instructions && <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>{task.instructions}</p>}
                            {task.teacherFeedback && <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}><strong>Teacher feedback:</strong> {task.teacherFeedback}</p>}
                        </div>
                    ))}
                </div>
                <Link to="/portal/plp/my-tasks" className="btn btn-secondary btn-sm" style={{ marginTop: 10, display: 'inline-block' }}>
                    Go to My Tasks
                </Link>
            </div>

            <div className="plp-section">
                <h2>Recent Positive Observations</h2>
                {evidence.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No observations recorded yet.</p>}
                <div style={{ display: 'grid', gap: 10 }}>
                    {evidence.map((item) => (
                        <div key={item._id} className="plp-evidence-item">
                            <span className={`plp-badge plp-badge-${item.type}`} style={{ marginBottom: 4 }}>{plpLabel(EVIDENCE_TYPE_LABELS, item.type)}</span>
                            <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>{item.note}</p>
                            <div className="plp-evidence-meta">
                                {item.traitId?.name ? `${item.traitId.name} · ` : ''}
                                {new Date(item.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
