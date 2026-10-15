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

    return (
        <div className="plp-page">
            <div className="plp-header">
                <div>
                    <h1>My Portfolio</h1>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
                        {record.cycle?.title || `Month ${record.month}`} · {record.academicYear}
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div className="plp-evidence-meta" style={{ marginTop: 6 }}>
                        Observation count: {Number(record.evidenceCount || 0)}
                    </div>
                    {history.length > 0 && (
                        <label className="plp-form-group" style={{ minWidth: 220, margin: 0 }}>
                            <span>Portfolio history</span>
                            <select value={activeRecordId} onChange={(event) => setSelectedRecordId(event.target.value)}>
                                {history.map((item) => (
                                    <option key={item._id} value={item._id}>
                                        {item.cycle?.title || `Month ${item.month}`} · {item.academicYear} · {item.status}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
            </div>

            <div className="plp-section">
                <h2>Focus Trait</h2>
                <p>{record.focusTrait?.name || 'Not yet assigned'}</p>
            </div>

            <PlpEmailConsentControl />

            <div className="plp-section">
                <h2>My Goals</h2>
                {goals.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No goals recorded yet.</p>}
                <div style={{ display: 'grid', gap: 10 }}>
                    {goals.map((goal) => (
                        <div key={goal._id} className="plp-evidence-item">
                            <strong>{goal.title}</strong>
                            <div className="plp-evidence-meta">{goal.goalType} · status: {goal.status}</div>
                            {goal.successCriteria && <p style={{ margin: '6px 0 0' }}>{goal.successCriteria}</p>}
                            {goal.checkInDate && <div className="plp-evidence-meta">Check-in: {formatPlpDate(goal.checkInDate)}</div>}
                            {goal.milestones?.length > 0 && (
                                <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                                    {goal.milestones.map((milestone, index) => (
                                        <li key={`${milestone.title}-${index}`}>
                                            {milestone.title} · {milestone.status}
                                            {milestone.targetDate && ` · due ${formatPlpDate(milestone.targetDate)}`}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {goal.reviewOutcome && (
                                <div className="plp-evidence-meta">
                                    Teacher review: {goal.reviewOutcome}
                                    {goal.lastReviewedAt && ` · ${new Date(goal.lastReviewedAt).toLocaleDateString()}`}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="plp-section">
                <h2>My Tasks</h2>
                {tasks.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No tasks assigned yet.</p>}
                <div style={{ display: 'grid', gap: 10 }}>
                    {tasks.map((task) => (
                        <div key={task._id} className="plp-evidence-item">
                            <strong>{task.title}</strong>
                            <div className="plp-evidence-meta">status: {task.status}</div>
                            {task.teacherFeedback && <p style={{ margin: '6px 0 0' }}><strong>Teacher feedback:</strong> {task.teacherFeedback}</p>}
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
                            <span className="plp-badge plp-badge-draft" style={{ marginBottom: 4 }}>{item.type?.replace('_', ' ')}</span>
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
