import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchPlpRecord, updatePlpRecord, submitPlpRecord,
    fetchPlpEvidence, createPlpEvidence, deletePlpEvidence,
    fetchPlpGoals, createPlpGoal, updatePlpGoal,
    fetchPlpTasks, createPlpTask, updatePlpTask, reviewPlpTask,
    fetchPlpRecordInteractions, addSupervisorNote,
    selectSelectedPlpRecord, selectPlpEvidence, selectPlpLoading, selectPlpError, clearPlpError,
    selectPlpGoals, selectPlpTasks, selectPlpInteractions,
} from '../../store/slices/plpSlice';
import { selectUser } from '../../store/slices/authSlice';
import toast from 'react-hot-toast';
import api from '../../config/api';
import './PLP.css';

const EVIDENCE_TYPES = ['observation', 'incident', 'positive_example', 'reflection'];
const GOAL_TYPES = ['character', 'academic'];
const SCORE_SOURCES = ['ai_suggested', 'teacher_override', 'teacher_manual'];

export default function PlpRecordDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const record = useSelector(selectSelectedPlpRecord);
    const evidence = useSelector(selectPlpEvidence(id));
    const goals = useSelector(selectPlpGoals(id));
    const interactions = useSelector(selectPlpInteractions(id));
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const [selectedGoalId, setSelectedGoalId] = useState('');
    const tasks = useSelector(selectPlpTasks(selectedGoalId));

    const [traitSuggestionRows, setTraitSuggestionRows] = useState([]);
    const [traitScoreDraft, setTraitScoreDraft] = useState({});
    const [traitOverrideReasons, setTraitOverrideReasons] = useState({});
    const [expandedThemes, setExpandedThemes] = useState({});
    const [loadingTraitSuggestions, setLoadingTraitSuggestions] = useState(false);
    const [showEvidenceForm, setShowEvidenceForm] = useState(false);
    const [evForm, setEvForm] = useState({ type: 'observation', note: '', taggedTraits: [] });
    const [showGoalForm, setShowGoalForm] = useState(false);
    const [goalForm, setGoalForm] = useState({ goalType: 'character', title: '', description: '', successCriteria: '', targetDate: '' });
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [taskForm, setTaskForm] = useState({ title: '', instructions: '', dueDate: '' });
    const [supervisorNote, setSupervisorNote] = useState('');

    useEffect(() => {
        dispatch(fetchPlpRecord(id));
        dispatch(fetchPlpEvidence(id));
        dispatch(fetchPlpGoals(id));
        dispatch(fetchPlpRecordInteractions(id));
    }, [dispatch, id]);

    useEffect(() => {
        if (goals.length > 0) {
            if (!selectedGoalId || !goals.some((goal) => goal._id === selectedGoalId)) {
                setSelectedGoalId(goals[0]._id);
            }
        } else {
            setSelectedGoalId('');
        }
    }, [goals, selectedGoalId]);

    useEffect(() => {
        if (selectedGoalId) {
            dispatch(fetchPlpTasks(selectedGoalId));
        }
    }, [dispatch, selectedGoalId]);

    useEffect(() => {
        if (error) { toast.error(error); dispatch(clearPlpError()); }
    }, [error, dispatch]);

    const loadTraitScoreSuggestions = async () => {
        setLoadingTraitSuggestions(true);
        try {
            const response = await api.get(`/plp/records/${id}/trait-score-suggestions`);
            const rows = response?.data?.data?.traits || [];
            setTraitSuggestionRows(rows);
            setExpandedThemes((prev) => {
                const next = { ...prev };
                rows.forEach((row) => {
                    const key = String(row?.trait?.themeId?._id || row?.trait?.themeCode || 'other');
                    if (next[key] === undefined) next[key] = true;
                });
                return next;
            });
            setTraitScoreDraft((prev) => {
                const next = { ...prev };
                rows.forEach((row) => {
                    const traitId = String(row?.trait?._id || '');
                    if (!traitId || next[traitId] !== undefined) return;
                    const savedScore = row?.saved?.score;
                    const suggestedScore = row?.suggestion?.suggestedScore;
                    if (savedScore !== null && savedScore !== undefined) next[traitId] = String(savedScore);
                    else if (suggestedScore !== null && suggestedScore !== undefined) next[traitId] = String(suggestedScore);
                    else next[traitId] = '';
                });
                return next;
            });
            setTraitOverrideReasons((prev) => {
                const next = { ...prev };
                rows.forEach((row) => {
                    const traitId = String(row?.trait?._id || '');
                    if (!traitId || next[traitId] !== undefined) return;
                    next[traitId] = row?.saved?.overrideReason || '';
                });
                return next;
            });
        } catch (requestError) {
            toast.error(requestError?.response?.data?.message || 'Failed to load trait score suggestions');
            setTraitSuggestionRows([]);
        } finally {
            setLoadingTraitSuggestions(false);
        }
    };

    useEffect(() => {
        if (record?._id) {
            loadTraitScoreSuggestions();
        }
    }, [record?._id, id]);

    const groupedTraitSuggestions = useMemo(() => {
        return traitSuggestionRows.reduce((acc, row) => {
            const key = String(row?.trait?.themeId?._id || row?.trait?.themeCode || 'other');
            if (!acc[key]) {
                acc[key] = {
                    key,
                    themeTitle: row?.trait?.themeId?.title || row?.trait?.themeCode || 'Other',
                    rows: [],
                };
            }
            acc[key].rows.push(row);
            return acc;
        }, {});
    }, [traitSuggestionRows]);

    const groupedTraitSuggestionList = useMemo(() => {
        return Object.values(groupedTraitSuggestions).sort((a, b) => String(a.themeTitle).localeCompare(String(b.themeTitle)));
    }, [groupedTraitSuggestions]);

    const saveScores = async () => {
        const traitScoreEntries = {};
        traitSuggestionRows.forEach((row) => {
            const traitId = String(row?.trait?._id || '');
            if (!traitId) return;
            const rawValue = String(traitScoreDraft[traitId] ?? '').trim();
            if (!rawValue) return;
            const score = Number(rawValue);
            if (!Number.isFinite(score) || score < 0 || score > 5) return;

            const suggestedScore = row?.suggestion?.suggestedScore;
            const evidenceCount = Number(row?.suggestion?.evidenceCount || 0);
            let scoreSource = 'teacher_manual';
            if (suggestedScore !== null && suggestedScore !== undefined) {
                scoreSource = Number(suggestedScore) === score ? 'ai_suggested' : 'teacher_override';
            } else if (evidenceCount > 0) {
                scoreSource = 'teacher_override';
            }
            if (!SCORE_SOURCES.includes(scoreSource)) scoreSource = 'teacher_manual';

            traitScoreEntries[traitId] = {
                score,
                scoreSource,
                aiSuggestedScore: suggestedScore ?? null,
                overrideReason: String(traitOverrideReasons[traitId] || '').trim(),
            };
        });

        const r = await dispatch(updatePlpRecord({ id, data: { traitScoreEntries } }));
        if (!r.error) {
            toast.success('Scores saved');
            dispatch(fetchPlpRecord(id));
            loadTraitScoreSuggestions();
        }
    };

    const handleSubmit = async () => {
        const r = await dispatch(submitPlpRecord(id));
        if (!r.error) toast.success('Submitted');
        else toast.error(r.payload);
    };

    const addEvidence = async () => {
        if (!evForm.note.trim()) {
            toast.error('Evidence note is required');
            return;
        }
        const r = await dispatch(createPlpEvidence({ recordId: id, data: evForm }));
        if (!r.error) {
            setEvForm({ type: 'observation', note: '', taggedTraits: [] });
            setShowEvidenceForm(false);
            toast.success('Evidence added');
            dispatch(fetchPlpRecord(id));
            dispatch(fetchPlpEvidence(id));
            loadTraitScoreSuggestions();
        }
    };

    const removeEvidence = async (evId) => {
        if (!window.confirm('Delete this evidence?')) return;
        const r = await dispatch(deletePlpEvidence(evId));
        if (!r.error) {
            dispatch(fetchPlpRecord(id));
            dispatch(fetchPlpEvidence(id));
            loadTraitScoreSuggestions();
            toast.success('Evidence deleted');
        }
    };

    const createGoalHandler = async () => {
        if (!goalForm.title.trim()) {
            toast.error('Goal title is required');
            return;
        }
        const payload = {
            ...goalForm,
            targetDate: goalForm.targetDate || null,
        };
        const r = await dispatch(createPlpGoal({ recordId: id, data: payload }));
        if (!r.error) {
            setGoalForm({ goalType: 'character', title: '', description: '', successCriteria: '', targetDate: '' });
            setShowGoalForm(false);
            dispatch(fetchPlpGoals(id));
            toast.success('Goal created');
        }
    };

    const updateGoalStatus = async (goalId, status) => {
        const r = await dispatch(updatePlpGoal({ goalId, data: { status } }));
        if (!r.error) {
            dispatch(fetchPlpGoals(id));
            dispatch(fetchPlpRecordInteractions(id));
            toast.success('Goal updated');
        }
    };

    const createTaskHandler = async () => {
        if (!selectedGoalId) {
            toast.error('Select a goal first');
            return;
        }
        if (!taskForm.title.trim()) {
            toast.error('Task title is required');
            return;
        }
        const r = await dispatch(createPlpTask({
            goalId: selectedGoalId,
            data: {
                ...taskForm,
                dueDate: taskForm.dueDate || null,
            },
        }));
        if (!r.error) {
            setTaskForm({ title: '', instructions: '', dueDate: '' });
            setShowTaskForm(false);
            dispatch(fetchPlpTasks(selectedGoalId));
            dispatch(fetchPlpRecordInteractions(id));
            toast.success('Task assigned');
        }
    };

    const updateTaskStatus = async (taskId, status) => {
        const r = await dispatch(updatePlpTask({ taskId, data: { status } }));
        if (!r.error) {
            dispatch(fetchPlpTasks(selectedGoalId));
            dispatch(fetchPlpRecordInteractions(id));
            toast.success('Task updated');
        }
    };

    const reviewTaskHandler = async (taskId, status) => {
        const feedback = window.prompt('Teacher feedback (optional):', '') || '';
        const r = await dispatch(reviewPlpTask({ taskId, data: { status, teacherFeedback: feedback } }));
        if (!r.error) {
            dispatch(fetchPlpTasks(selectedGoalId));
            dispatch(fetchPlpRecordInteractions(id));
            toast.success('Task reviewed');
        }
    };

    const submitSupervisorNote = async () => {
        const note = supervisorNote.trim();
        if (!note) {
            toast.error('Note is required');
            return;
        }
        const r = await dispatch(addSupervisorNote({ recordId: id, note }));
        if (!r.error) {
            setSupervisorNote('');
            dispatch(fetchPlpRecordInteractions(id));
            toast.success('Supervisor note added');
        }
    };

    if (loading && !record) return <div className="plp-loading">Loading…</div>;
    if (!record) return <div className="plp-empty">Record not found.</div>;

    const locked = record.status === 'locked';
    const canWrite = !locked && ['teacher', 'admin'].includes(user?.role);
    const isSupervisor = user?.role === 'department_principal';

    return (
        <div className="plp-page">
            <div className="plp-header">
                <div>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>← Back</button>
                    <h1>{record.student?.firstName} {record.student?.lastName} — {record.theme?.charAt(0).toUpperCase() + record.theme?.slice(1)}</h1>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <span className={`plp-badge plp-badge-${record.level}`}>{record.level}</span>
                        <span className={`plp-badge plp-badge-${record.status}`}>{record.status}</span>
                    </div>
                </div>
                {canWrite && record.status === 'in_progress' && (
                    <button className="btn btn-primary" onClick={handleSubmit}>Submit Record</button>
                )}
            </div>

            <div className="plp-section">
                <h2>Trait Scores (0–5)</h2>
                <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    AI suggests a score from evidence for each trait. You can keep it or override before saving.
                </p>
                {loadingTraitSuggestions && <div className="plp-loading" style={{ padding: 8 }}>Loading score suggestions…</div>}
                {!loadingTraitSuggestions && groupedTraitSuggestionList.length === 0 && (
                    <div className="plp-empty" style={{ padding: 16 }}>No active traits configured for this school.</div>
                )}
                {!loadingTraitSuggestions && groupedTraitSuggestionList.map((group) => (
                    <div key={group.key} className="plp-trait-group">
                        <button
                            type="button"
                            className="plp-trait-group-toggle"
                            onClick={() => setExpandedThemes((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                        >
                            <strong>{group.themeTitle}</strong>
                            <span>{expandedThemes[group.key] ? 'Hide' : 'Show'}</span>
                        </button>
                        {expandedThemes[group.key] && (
                            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                                {group.rows.map((row) => {
                                    const traitId = String(row?.trait?._id || '');
                                    const suggestion = row?.suggestion || {};
                                    const suggestedScore = suggestion?.suggestedScore;
                                    const evidenceCount = Number(suggestion?.evidenceCount || 0);
                                    const value = String(traitScoreDraft[traitId] ?? '');
                                    const normalizedReason = String(traitOverrideReasons[traitId] || '');
                                    return (
                                        <div key={traitId} className="plp-evidence-item" style={{ padding: '8px 0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                                <div>
                                                    <strong>{row.trait.name}</strong>
                                                    <div className="plp-evidence-meta">
                                                        Evidence: {evidenceCount}
                                                        {suggestedScore !== null && suggestedScore !== undefined ? ` · AI suggests ${suggestedScore}` : ' · No evidence logged yet'}
                                                        {suggestion?.confidence ? ` · confidence ${suggestion.confidence}` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            {suggestion?.rationale && (
                                                <p style={{ margin: '6px 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{suggestion.rationale}</p>
                                            )}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                                                <div className="plp-form-group" style={{ marginBottom: 0 }}>
                                                    <label>Final score (0–5)</label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={5}
                                                        step={0.5}
                                                        value={value}
                                                        disabled={!canWrite}
                                                        onChange={(event) => setTraitScoreDraft((prev) => ({ ...prev, [traitId]: event.target.value }))}
                                                        placeholder={suggestedScore === null || suggestedScore === undefined ? 'Leave blank' : String(suggestedScore)}
                                                    />
                                                </div>
                                                <div className="plp-form-group" style={{ marginBottom: 0 }}>
                                                    <label>Override reason (optional)</label>
                                                    <input
                                                        value={normalizedReason}
                                                        disabled={!canWrite}
                                                        onChange={(event) => setTraitOverrideReasons((prev) => ({ ...prev, [traitId]: event.target.value }))}
                                                        placeholder="Optional note if your final score differs from AI suggestion"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
                {canWrite && (
                    <button className="btn btn-primary btn-sm" onClick={saveScores} style={{ marginTop: 8 }}>Save Scores</button>
                )}
                <div style={{ marginTop: 12 }}>
                    <strong>Weighted score:</strong> {record.weightedScore?.toFixed(1)}&nbsp;
                    <span className={`plp-badge plp-badge-${record.level}`}>{record.level}</span>
                </div>
            </div>

            <div className="plp-section">
                <h2>Goals</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                    <select value={selectedGoalId} onChange={(e) => setSelectedGoalId(e.target.value)} style={{ minWidth: 280 }}>
                        <option value="">Select goal</option>
                        {goals.map((goal) => (
                            <option key={goal._id} value={goal._id}>{goal.goalType}: {goal.title}</option>
                        ))}
                    </select>
                    {canWrite && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowGoalForm((prev) => !prev)}>
                            {showGoalForm ? 'Hide Form' : '+ New Goal'}
                        </button>
                    )}
                </div>

                {showGoalForm && canWrite && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <div className="plp-form-group">
                            <label>Type</label>
                            <select value={goalForm.goalType} onChange={(e) => setGoalForm({ ...goalForm, goalType: e.target.value })}>
                                {GOAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="plp-form-group">
                            <label>Title</label>
                            <input value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} />
                        </div>
                        <div className="plp-form-group">
                            <label>Description</label>
                            <textarea value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} />
                        </div>
                        <div className="plp-form-group">
                            <label>Success Criteria</label>
                            <textarea value={goalForm.successCriteria} onChange={(e) => setGoalForm({ ...goalForm, successCriteria: e.target.value })} />
                        </div>
                        <div className="plp-form-group">
                            <label>Target Date</label>
                            <input type="date" value={goalForm.targetDate} onChange={(e) => setGoalForm({ ...goalForm, targetDate: e.target.value })} />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={createGoalHandler}>Create Goal</button>
                    </div>
                )}

                <div style={{ display: 'grid', gap: 10 }}>
                    {goals.map((goal) => (
                        <div key={goal._id} className="plp-evidence-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                <div>
                                    <strong>{goal.title}</strong>
                                    <div className="plp-evidence-meta">{goal.goalType} · status: {goal.status}</div>
                                </div>
                                {canWrite && (
                                    <select value={goal.status} onChange={(e) => updateGoalStatus(goal._id, e.target.value)}>
                                        <option value="active">active</option>
                                        <option value="completed">completed</option>
                                        <option value="carried_forward">carried_forward</option>
                                        <option value="archived">archived</option>
                                    </select>
                                )}
                            </div>
                        </div>
                    ))}
                    {goals.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No goals yet.</p>}
                </div>
            </div>

            <div className="plp-section">
                <h2>Tasks for Selected Goal</h2>
                {canWrite && selectedGoalId && (
                    <div style={{ marginBottom: 12 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowTaskForm((prev) => !prev)}>
                            {showTaskForm ? 'Hide Form' : '+ Assign Task'}
                        </button>
                    </div>
                )}

                {showTaskForm && canWrite && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <div className="plp-form-group">
                            <label>Title</label>
                            <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
                        </div>
                        <div className="plp-form-group">
                            <label>Instructions</label>
                            <textarea value={taskForm.instructions} onChange={(e) => setTaskForm({ ...taskForm, instructions: e.target.value })} />
                        </div>
                        <div className="plp-form-group">
                            <label>Due Date</label>
                            <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={createTaskHandler}>Assign Task</button>
                    </div>
                )}

                <div style={{ display: 'grid', gap: 10 }}>
                    {tasks.map((task) => (
                        <div key={task._id} className="plp-evidence-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                <div>
                                    <strong>{task.title}</strong>
                                    <div className="plp-evidence-meta">
                                        status: {task.status}
                                        {task.dueDate ? ` · due ${new Date(task.dueDate).toLocaleDateString()}` : ''}
                                    </div>
                                    {task.instructions && <p style={{ margin: '4px 0 0' }}>{task.instructions}</p>}
                                    {task.studentCompletionNote && <p style={{ margin: '6px 0 0' }}><strong>Student note:</strong> {task.studentCompletionNote}</p>}
                                    {task.studentComment && <p style={{ margin: '4px 0 0' }}><strong>Student comment:</strong> {task.studentComment}</p>}
                                    {task.teacherFeedback && <p style={{ margin: '4px 0 0' }}><strong>Teacher feedback:</strong> {task.teacherFeedback}</p>}
                                </div>
                                {canWrite && (
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <button className="btn btn-secondary btn-sm" onClick={() => updateTaskStatus(task._id, 'in_progress')}>Mark In Progress</button>
                                        <button className="btn btn-secondary btn-sm" onClick={() => reviewTaskHandler(task._id, 'reviewed')}>Review</button>
                                        <button className="btn btn-primary btn-sm" onClick={() => reviewTaskHandler(task._id, 'completed')}>Complete</button>
                                        <button className="btn btn-secondary btn-sm" onClick={() => reviewTaskHandler(task._id, 'needs_revision')}>Needs Revision</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {selectedGoalId && tasks.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No tasks yet for this goal.</p>}
                    {!selectedGoalId && <p style={{ color: 'var(--text-muted)' }}>Select a goal to view tasks.</p>}
                </div>
            </div>

            <div className="plp-section">
                <h2>Personalized Activities</h2>
                {record.recommendedActivities?.length ? (
                    <ul className="plp-activity-list">
                        {record.recommendedActivities.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                ) : <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No activities yet. Save scores to generate.</p>}
            </div>

            <div className="plp-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h2 style={{ margin: 0 }}>Evidence ({record.evidenceCount})</h2>
                    {canWrite && <button className="btn btn-secondary btn-sm" onClick={() => setShowEvidenceForm(!showEvidenceForm)}>+ Add Evidence</button>}
                </div>

                {showEvidenceForm && canWrite && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <div className="plp-form-group">
                            <label>Type</label>
                            <select value={evForm.type} onChange={(e) => setEvForm({ ...evForm, type: e.target.value })}>
                                {EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                            </select>
                        </div>
                        <div className="plp-form-group">
                            <label>Note</label>
                            <textarea value={evForm.note} onChange={(e) => setEvForm({ ...evForm, note: e.target.value })} placeholder="Describe what you observed…" />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={addEvidence}>Save</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowEvidenceForm(false)}>Cancel</button>
                        </div>
                    </div>
                )}

                {evidence.map((ev) => (
                    <div key={ev._id} className="plp-evidence-item">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <span className={`plp-badge plp-badge-draft`} style={{ marginBottom: 4 }}>{ev.type?.replace('_', ' ')}</span>
                                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{ev.note}</p>
                            </div>
                            {canWrite && (
                                <button className="btn btn-secondary btn-sm" onClick={() => removeEvidence(ev._id)}>×</button>
                            )}
                        </div>
                        <div className="plp-evidence-meta">
                            {ev.teacher?.firstName} {ev.teacher?.lastName} · {new Date(ev.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                ))}
                {evidence.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No evidence recorded yet.</p>}
            </div>

            <div className="plp-section">
                <h2>Timeline and Internal Notes</h2>
                {isSupervisor && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <div className="plp-form-group">
                            <label>Supervisor note (internal only)</label>
                            <textarea value={supervisorNote} onChange={(e) => setSupervisorNote(e.target.value)} placeholder="Add guidance for homeroom teacher" />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={submitSupervisorNote}>Post Note</button>
                    </div>
                )}

                <div style={{ display: 'grid', gap: 10 }}>
                    {interactions.map((item) => {
                        const note = item?.payload?.note;
                        const feedback = item?.payload?.feedback;
                        const fromStatus = item?.payload?.from;
                        const toStatus = item?.payload?.to;
                        return (
                            <div key={item._id} className="plp-evidence-item">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <strong>{item.actionType?.replace('_', ' ')}</strong>
                                    <span className="plp-evidence-meta">{new Date(item.createdAt).toLocaleString()}</span>
                                </div>
                                <div className="plp-evidence-meta">by {item.actor?.firstName} {item.actor?.lastName} ({item.actorRole})</div>
                                {note && <p style={{ marginTop: 6 }}>{note}</p>}
                                {feedback && <p style={{ marginTop: 6 }}><strong>Feedback:</strong> {feedback}</p>}
                                {(fromStatus || toStatus) && <p style={{ marginTop: 6 }}>Status: {fromStatus || 'none'} → {toStatus || 'none'}</p>}
                            </div>
                        );
                    })}
                    {interactions.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No timeline activity yet.</p>}
                </div>
            </div>
        </div>
    );
}
