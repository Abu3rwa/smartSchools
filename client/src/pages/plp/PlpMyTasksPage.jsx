import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchMyPlpStudentTasks,
    submitMyPlpTask,
    selectMyPlpStudentTasks,
    selectPlpLoading,
    selectPlpError,
    clearPlpError,
} from '../../store/slices/plpSlice';
import toast from 'react-hot-toast';
import './PLP.css';

const MAX_WORDS = 100;
const SUBMITTABLE_STATUSES = ['assigned', 'in_progress', 'needs_revision'];

const countWords = (text = '') => {
    return String(text)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .length;
};

const formatDate = (value) => {
    if (!value) return 'No due date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No due date';
    return date.toLocaleDateString();
};

const statusLabel = (status) => String(status || 'assigned').replaceAll('_', ' ');

export default function PlpMyTasksPage() {
    const dispatch = useDispatch();
    const tasks = useSelector(selectMyPlpStudentTasks);
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);

    const [drafts, setDrafts] = useState({});

    useEffect(() => {
        dispatch(fetchMyPlpStudentTasks());
    }, [dispatch]);

    useEffect(() => {
        if (error) {
            toast.error(error);
            dispatch(clearPlpError());
        }
    }, [error, dispatch]);

    const sortedTasks = useMemo(() => {
        return [...tasks].sort((a, b) => {
            const aDue = a?.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
            const bDue = b?.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
            if (aDue !== bDue) return aDue - bDue;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }, [tasks]);

    const setDraftField = (taskId, key, value) => {
        setDrafts((prev) => ({
            ...prev,
            [taskId]: {
                ...(prev[taskId] || {}),
                [key]: value,
            },
        }));
    };

    const submitTask = async (task) => {
        const draft = drafts[task._id] || {};
        const studentCompletionNote = (draft.studentCompletionNote || '').trim();
        const studentComment = (draft.studentComment || '').trim();

        const noteWords = countWords(studentCompletionNote);
        const commentWords = countWords(studentComment);

        if (!studentCompletionNote) {
            toast.error('Completion note is required');
            return;
        }
        if (noteWords > MAX_WORDS) {
            toast.error(`Completion note must be ${MAX_WORDS} words or fewer`);
            return;
        }
        if (commentWords > MAX_WORDS) {
            toast.error(`Comment must be ${MAX_WORDS} words or fewer`);
            return;
        }

        const payload = {
            studentCompletionNote,
            studentComment,
        };

        const result = await dispatch(submitMyPlpTask({ taskId: task._id, data: payload }));
        if (!result.error) {
            toast.success('Task submitted for teacher review');
            dispatch(fetchMyPlpStudentTasks());
        }
    };

    return (
        <div className="plp-page">
            <div className="plp-header">
                <div>
                    <h1>My PLP Tasks</h1>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
                        Keep each note and comment under 100 words.
                    </p>
                </div>
            </div>

            {loading && tasks.length === 0 && <div className="plp-loading">Loading tasks...</div>}

            {!loading && sortedTasks.length === 0 && (
                <div className="plp-empty">No PLP tasks assigned yet.</div>
            )}

            <div style={{ display: 'grid', gap: 14 }}>
                {sortedTasks.map((task) => {
                    const draft = drafts[task._id] || {};
                    const canSubmit = SUBMITTABLE_STATUSES.includes(task.status);
                    const noteWords = countWords(draft.studentCompletionNote || '');
                    const commentWords = countWords(draft.studentComment || '');

                    return (
                        <div key={task._id} className="plp-section" style={{ marginBottom: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                <div>
                                    <h2 style={{ marginBottom: 6 }}>{task.title}</h2>
                                    <div className="plp-evidence-meta">
                                        Goal: {task.plpGoal?.title || 'PLP Goal'}
                                    </div>
                                    <div className="plp-evidence-meta">
                                        Assigned by: {task.assignedByTeacher?.firstName} {task.assignedByTeacher?.lastName}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span className={`plp-badge plp-badge-${task.status}`}>{statusLabel(task.status)}</span>
                                    <div className="plp-evidence-meta" style={{ marginTop: 6 }}>
                                        Due: {formatDate(task.dueDate)}
                                    </div>
                                </div>
                            </div>

                            {task.instructions && (
                                <div style={{ marginTop: 10 }}>
                                    <strong>Instructions</strong>
                                    <p style={{ margin: '6px 0 0' }}>{task.instructions}</p>
                                </div>
                            )}

                            {task.teacherFeedback && (
                                <div style={{ marginTop: 10 }}>
                                    <strong>Teacher feedback</strong>
                                    <p style={{ margin: '6px 0 0' }}>{task.teacherFeedback}</p>
                                </div>
                            )}

                            <div style={{ marginTop: 12, background: 'var(--bg-secondary)', borderRadius: 10, padding: 12 }}>
                                <div className="plp-form-group" style={{ marginBottom: 10 }}>
                                    <label>Completion note ({noteWords}/{MAX_WORDS} words)</label>
                                    <textarea
                                        value={typeof draft.studentCompletionNote === 'string' ? draft.studentCompletionNote : task.studentCompletionNote || ''}
                                        onChange={(e) => setDraftField(task._id, 'studentCompletionNote', e.target.value)}
                                        placeholder="What did you do, and what was the result?"
                                        disabled={!canSubmit}
                                    />
                                </div>
                                <div className="plp-form-group" style={{ marginBottom: 10 }}>
                                    <label>Comment ({commentWords}/{MAX_WORDS} words)</label>
                                    <textarea
                                        value={typeof draft.studentComment === 'string' ? draft.studentComment : task.studentComment || ''}
                                        onChange={(e) => setDraftField(task._id, 'studentComment', e.target.value)}
                                        placeholder="Any challenge, reflection, or request for help?"
                                        disabled={!canSubmit}
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span className="plp-evidence-meta">
                                        {canSubmit ? 'Ready to submit once complete.' : 'This task is already submitted or completed.'}
                                    </span>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => submitTask(task)}
                                        disabled={!canSubmit || noteWords > MAX_WORDS || commentWords > MAX_WORDS}
                                    >
                                        Submit to Teacher
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
