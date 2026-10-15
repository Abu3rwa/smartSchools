import { useEffect, useState } from 'react';
import api from '../../config/api';
import toast from 'react-hot-toast';

const createCopyOperationId = () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `plp-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export default function PlpCopyGoalModal({ goal, onClose, onCopied }) {
    const [destinations, setDestinations] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [copyDueDates, setCopyDueDates] = useState(false);
    const [copyOperationId] = useState(createCopyOperationId);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let isCurrent = true;
        Promise.all([
            api.get(`/plp/goals/${goal._id}/copy-destinations`),
            api.get(`/plp/goals/${goal._id}/tasks`),
        ]).then(([destinationResponse, taskResponse]) => {
            if (!isCurrent) return;
            setDestinations(destinationResponse.data.data || []);
            setTasks(taskResponse.data.data || []);
        }).catch((requestError) => {
            if (isCurrent) setError(requestError.response?.data?.message || 'Unable to load eligible students.');
        }).finally(() => {
            if (isCurrent) setLoading(false);
        });
        return () => { isCurrent = false; };
    }, [goal._id]);

    const toggleDestination = (recordId) => {
        setSelectedIds((current) => (
            current.includes(recordId)
                ? current.filter((id) => id !== recordId)
                : [...current, recordId]
        ));
    };

    const submitCopy = async () => {
        if (!selectedIds.length) {
            toast.error('Select at least one student.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const response = await api.post(`/plp/goals/${goal._id}/copy`, {
                destinationRecordIds: selectedIds,
                copyDueDates,
                copyOperationId,
            });
            const results = response.data.data || [];
            const failures = results.filter((item) => item.notificationWarnings?.length);
            const copiedCount = results.filter((item) => !item.alreadyCopied).length;
            if (failures.length) {
                toast.error(`${copiedCount} plan(s) copied. Some student notifications need retrying.`);
            } else {
                toast.success(`Copied the goal and tasks to ${results.length} student(s).`);
            }
            onCopied(results);
            onClose();
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to copy this goal.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div role="presentation" onClick={onClose} style={overlayStyle}>
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="plp-copy-goal-title"
                onClick={(event) => event.stopPropagation()}
                style={dialogStyle}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <h2 id="plp-copy-goal-title" style={{ margin: 0 }}>Copy goal plan</h2>
                        <p style={{ margin: '6px 0 12px' }}>Copy “{goal.title}” as an independent plan to students in this class and round.</p>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close copy goal dialog">Close</button>
                </div>

                <div className="plp-evidence-item">
                    <strong>{goal.goalType}: {goal.title}</strong>
                    {goal.description && <p>{goal.description}</p>}
                    {goal.successCriteria && <p><strong>Success criteria:</strong> {goal.successCriteria}</p>}
                    <div style={{ marginTop: 8 }}>
                        <strong>Tasks in the plan</strong>
                        {tasks.length
                            ? <ul>{tasks.map((task) => <li key={task._id}>{task.title}{task.instructions ? ` — ${task.instructions}` : ''}</li>)}</ul>
                            : <p>No tasks; only the goal will be copied.</p>}
                    </div>
                </div>

                <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
                    <input type="checkbox" checked={copyDueDates} onChange={(event) => setCopyDueDates(event.target.checked)} />
                    Also copy the goal and task due dates
                </label>
                <p className="plp-evidence-meta">Student work, feedback, completion status, evidence, and progress notes are never copied.</p>

                {loading && <p>Loading eligible students…</p>}
                {!loading && destinations.length === 0 && <p>No other in-progress student records are available in this class and round.</p>}
                {destinations.length > 0 && (
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 6, margin: '12px 0' }}>
                        {destinations.map((destination) => (
                            <label key={destination._id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(destination._id)}
                                    onChange={() => toggleDestination(destination._id)}
                                />
                                {destination.student?.firstName} {destination.student?.lastName}
                                {destination.student?.studentId ? ` (${destination.student.studentId})` : ''}
                            </label>
                        ))}
                    </div>
                )}
                {error && <p role="alert" style={{ color: 'var(--danger, #b42318)' }}>{error}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={submitCopy}
                        disabled={loading || submitting || !destinations.length}
                    >
                        {submitting ? 'Copying…' : `Copy to ${selectedIds.length || 'selected'} student${selectedIds.length === 1 ? '' : 's'}`}
                    </button>
                </div>
            </section>
        </div>
    );
}

const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 1200,
    background: 'rgba(15, 23, 42, 0.56)',
    display: 'grid',
    placeItems: 'center',
    padding: 16,
};

const dialogStyle = {
    width: 'min(640px, 100%)',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: 'var(--bg-primary, #fff)',
    color: 'var(--text-primary, #172033)',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.22)',
};
