import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchPlpRecord, updatePlpRecord, deletePlpRecord, submitPlpRecord, unlockPlpRecord,
    fetchPlpCycles, selectPlpCycles,
    fetchPlpEvidence, createPlpEvidence, updatePlpEvidence, deletePlpEvidence,
    fetchPlpGoals, createPlpGoal, updatePlpGoal, deletePlpGoal,
    fetchPlpActivities, createPlpActivity, updatePlpActivity, deletePlpActivity,
    fetchPlpTasks, createPlpTask, updatePlpTask, deletePlpTask, reviewPlpTask,
    fetchPlpRecordInteractions, addSupervisorNote,
    selectSelectedPlpRecord, selectPlpEvidence, selectPlpLoading, selectPlpError, clearPlpError,
    selectPlpGoals, selectPlpActivities, selectPlpTasks, selectPlpInteractions,
} from '../../store/slices/plpSlice';
import { selectUser } from '../../store/slices/authSlice';
import toast from 'react-hot-toast';
import api from '../../config/api';
import './PLP.css';

const EVIDENCE_TYPES = ['observation', 'incident', 'positive_example', 'reflection'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ActivityGroups({ activities, canWrite, onEdit, onDelete, onAssign }) {
    const groups = [
        ['suggested_from_observations', 'Suggested from observations'],
        ['added_by_teacher', 'Added by teacher'],
    ];
    return (
        <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
            {groups.map(([source, label]) => {
                const items = activities.filter((activity) => activity.source === source);
                return (
                    <div key={source}>
                        <h3 style={{ margin: '0 0 8px' }}>{label}</h3>
                        {items.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No activities in this group.</p>}
                        <div style={{ display: 'grid', gap: 8 }}>
                            {items.map((activity, index) => (
                                <div key={activity._id || `${source}-${index}`} className="plp-evidence-item">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                        <div>
                                            <strong>{activity.title}</strong>
                                            <div className="plp-evidence-meta">
                                                {activity.traitId?.name ? `Trait: ${activity.traitId.name}` : 'Trait: not linked'}
                                                {` · Status: ${activity.task?.status || activity.taskStatus || 'not assigned'}`}
                                            </div>
                                            {activity.rationale && <p style={{ margin: '5px 0 0' }}>{activity.rationale}</p>}
                                            {activity.instructions && <p style={{ margin: '5px 0 0' }}>{activity.instructions}</p>}
                                        </div>
                                        {canWrite && (
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                <button className="btn btn-primary btn-sm" onClick={() => onAssign(activity)}>Assign Task</button>
                                                {source === 'added_by_teacher' && !activity.isVirtual && <button className="btn btn-secondary btn-sm" onClick={() => onEdit(activity)}>Edit</button>}
                                                {source === 'added_by_teacher' && !activity.isVirtual && <button className="btn btn-secondary btn-sm" onClick={() => onDelete(activity)}>Delete</button>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function PlpRecordDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const record = useSelector(selectSelectedPlpRecord);
    const cycles = useSelector(selectPlpCycles);
    const evidence = useSelector(selectPlpEvidence(id));
    const goals = useSelector(selectPlpGoals(id));
    const activities = useSelector(selectPlpActivities(id));
    const interactions = useSelector(selectPlpInteractions(id));
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const [selectedGoalId, setSelectedGoalId] = useState('');
    const tasks = useSelector(selectPlpTasks(selectedGoalId));

    const [traitSuggestionRows, setTraitSuggestionRows] = useState([]);
    const [expandedThemes, setExpandedThemes] = useState({});
    const [loadingTraitSuggestions, setLoadingTraitSuggestions] = useState(false);
    const [showEvidenceForm, setShowEvidenceForm] = useState(false);
    const [evForm, setEvForm] = useState({ type: 'observation', note: '', taggedTraits: [], traitId: '' });
    const [showGoalForm, setShowGoalForm] = useState(false);
    const [goalForm, setGoalForm] = useState({ goalType: 'character', title: '', description: '', successCriteria: '', targetDate: '' });
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [taskForm, setTaskForm] = useState({ title: '', instructions: '', dueDate: '' });
    const [selectedActivityId, setSelectedActivityId] = useState('');
    const [supervisorNote, setSupervisorNote] = useState('');
    const [selectedCycleId, setSelectedCycleId] = useState('');
    const [activeTab, setActiveTab] = useState('character');
    const [exportingDocx, setExportingDocx] = useState(false);
    const [activityForm, setActivityForm] = useState({ title: '', instructions: '', traitId: '', goal: '', dueDate: '' });
    const [editingActivityId, setEditingActivityId] = useState('');
    const [showActivityForm, setShowActivityForm] = useState(false);
    const [editingEvidenceId, setEditingEvidenceId] = useState('');
    const [editEvidenceNote, setEditEvidenceNote] = useState('');
    const activeGoalType = activeTab === 'academic' ? 'academic' : 'character';
    const visibleGoals = useMemo(
        () => goals.filter((goal) => goal.goalType === activeGoalType),
        [goals, activeGoalType]
    );

    useEffect(() => {
        dispatch(fetchPlpRecord(id));
        dispatch(fetchPlpCycles());
        dispatch(fetchPlpEvidence(id));
        dispatch(fetchPlpGoals(id));
        dispatch(fetchPlpActivities(id));
        dispatch(fetchPlpRecordInteractions(id));
    }, [dispatch, id]);

    useEffect(() => {
        setSelectedCycleId(record?.cycle?._id || record?.cycle || '');
    }, [record?.cycle]);

    useEffect(() => {
        if (visibleGoals.length > 0) {
            if (!selectedGoalId || !visibleGoals.some((goal) => goal._id === selectedGoalId)) {
                setSelectedGoalId(visibleGoals[0]._id);
            }
        } else {
            setSelectedGoalId('');
        }
    }, [visibleGoals, selectedGoalId]);

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
                    const key = String(row?.trait?.month || 'other');
                    if (next[key] === undefined) next[key] = false;
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
            const key = String(row?.trait?.month || 'other');
            if (!acc[key]) {
                acc[key] = {
                    key,
                    monthTitle: row?.trait?.month ? MONTHS[Number(row.trait.month) - 1] : 'Other',
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
        let savedCount = 0;
        traitSuggestionRows.forEach((row) => {
            const traitId = String(row?.trait?._id || '');
            if (!traitId) return;
            const suggestedScore = row?.suggestion?.suggestedScore;
            const evidenceCount = Number(row?.suggestion?.evidenceCount || 0);
            if (suggestedScore === null || suggestedScore === undefined || evidenceCount <= 0) return;
            const score = Number(suggestedScore);
            traitScoreEntries[traitId] = {
                score,
                scoreSource: 'ai_suggested',
                aiSuggestedScore: suggestedScore ?? null,
                overrideReason: '',
            };
            savedCount += 1;
        });

        if (savedCount === 0) {
            toast.error('Add trait-linked observation evidence first. Scores can only be saved from observation records.');
            return;
        }

        const r = await dispatch(updatePlpRecord({ id, data: { traitScoreEntries } }));
        if (!r.error) {
            toast.success('Evidence-based scores saved');
            dispatch(fetchPlpRecord(id));
            loadTraitScoreSuggestions();
        } else {
            toast.error(r.payload || 'Failed to save scores');
        }
    };

    const handleSubmit = async () => {
        const r = await dispatch(submitPlpRecord(id));
        if (!r.error) toast.success('Submitted');
        else toast.error(r.payload);
    };

    const saveRoundAssignment = async () => {
        const r = await dispatch(updatePlpRecord({ id, data: { cycleId: selectedCycleId || null } }));
        if (!r.error) {
            toast.success(selectedCycleId ? 'Round assigned' : 'Round removed');
            dispatch(fetchPlpRecord(id));
        } else {
            toast.error(r.payload || 'Failed to update Round');
        }
    };

    const deleteRecord = async () => {
        if (!window.confirm('Delete this student PLP record and its evidence, goals, and tasks?')) return;
        const r = await dispatch(deletePlpRecord(id));
        if (!r.error) {
            toast.success('PLP record deleted');
            navigate(-1);
        } else {
            toast.error(r.payload || 'Failed to delete record');
        }
    };

    const unlockRecordHandler = async () => {
        const reason = window.prompt('Reason for unlocking this record:', '');
        if (!reason || !reason.trim()) {
            toast.error('A reason is required to unlock a record');
            return;
        }
        const r = await dispatch(unlockPlpRecord({ id, reason: reason.trim() }));
        if (!r.error) toast.success('Record unlocked');
        else toast.error(r.payload || 'Failed to unlock record');
    };

    const addEvidence = async () => {
        if (!evForm.traitId) {
            toast.error('Select a character trait for this observation');
            return;
        }
        if (!evForm.note.trim()) {
            toast.error('Evidence note is required');
            return;
        }
        const r = await dispatch(createPlpEvidence({ recordId: id, data: evForm }));
        if (!r.error) {
            setEvForm({ type: 'observation', note: '', taggedTraits: [], traitId: '' });
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

    const startEditEvidence = (ev) => {
        setEditingEvidenceId(ev._id);
        setEditEvidenceNote(ev.note || '');
    };

    const cancelEditEvidence = () => {
        setEditingEvidenceId('');
        setEditEvidenceNote('');
    };

    const saveEditEvidence = async (evId) => {
        if (!editEvidenceNote.trim()) {
            toast.error('Evidence note is required');
            return;
        }
        const r = await dispatch(updatePlpEvidence({ id: evId, data: { note: editEvidenceNote.trim() } }));
        if (!r.error) {
            toast.success('Evidence updated');
            cancelEditEvidence();
            dispatch(fetchPlpEvidence(id));
        } else {
            toast.error(r.payload || 'Failed to update evidence');
        }
    };

    const createGoalHandler = async () => {
        if (!goalForm.title.trim()) {
            toast.error('Goal title is required');
            return;
        }
        const payload = {
            ...goalForm,
            goalType: activeGoalType,
            targetDate: goalForm.targetDate || null,
        };
        const r = await dispatch(createPlpGoal({ recordId: id, data: payload }));
        if (!r.error) {
            setGoalForm({ goalType: activeGoalType, title: '', description: '', successCriteria: '', targetDate: '' });
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

    const updateGoalProgressNote = async (goalId, teacherProgressNote) => {
        const r = await dispatch(updatePlpGoal({ goalId, data: { teacherProgressNote } }));
        if (!r.error) {
            dispatch(fetchPlpGoals(id));
            toast.success('Goal progress note saved');
        } else {
            toast.error(r.payload || 'Failed to save goal progress note');
        }
    };

    const removeGoal = async (goal) => {
        if (!window.confirm(`Delete goal "${goal.title}"? Goals with tasks assigned cannot be deleted.`)) return;
        const r = await dispatch(deletePlpGoal(goal._id));
        if (!r.error) toast.success('Goal deleted');
        else toast.error(r.payload || 'Failed to delete goal');
    };

    const handleActivityForTask = (activity) => {
        const goalId = activity.goal?._id || activity.goal || selectedGoalId;
        if (!goalId) {
            toast.error('Select a goal before preparing an activity task');
            return;
        }
        setSelectedGoalId(goalId);
        setSelectedActivityId(activity._id || '');
        setTaskForm({ title: activity.title || activity, instructions: activity.instructions || '', dueDate: activity.dueDate ? String(activity.dueDate).slice(0, 10) : '' });
        setShowTaskForm(true);
    };

    const saveActivity = async () => {
        if (!activityForm.title.trim() || !activityForm.traitId) {
            toast.error('Activity title and character trait are required');
            return;
        }
        const data = { ...activityForm, goal: activityForm.goal || null, dueDate: activityForm.dueDate || null };
        const result = editingActivityId
            ? await dispatch(updatePlpActivity({ activityId: editingActivityId, data }))
            : await dispatch(createPlpActivity({ recordId: id, data }));
        if (!result.error) {
            setActivityForm({ title: '', instructions: '', traitId: '', goal: '', dueDate: '' });
            setEditingActivityId('');
            setShowActivityForm(false);
            dispatch(fetchPlpActivities(id));
            toast.success(editingActivityId ? 'Activity updated' : 'Activity added');
        } else toast.error(result.payload || 'Failed to save activity');
    };

    const editActivity = (activity) => {
        setEditingActivityId(activity._id);
        setActivityForm({ title: activity.title || '', instructions: activity.instructions || '', traitId: activity.traitId?._id || activity.traitId || '', goal: activity.goal?._id || activity.goal || '', dueDate: activity.dueDate ? String(activity.dueDate).slice(0, 10) : '' });
        setShowActivityForm(true);
    };

    const removeActivity = async (activity) => {
        if (!window.confirm(`Delete activity "${activity.title}"?`)) return;
        const result = await dispatch(deletePlpActivity(activity._id));
        if (!result.error) toast.success('Activity deleted');
        else toast.error(result.payload || 'Failed to delete activity');
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
            if (selectedActivityId && r.payload?.task?._id) {
                await dispatch(updatePlpActivity({ activityId: selectedActivityId, data: { task: r.payload.task._id, taskStatus: r.payload.task.status || 'assigned' } }));
                dispatch(fetchPlpActivities(id));
            }
            setTaskForm({ title: '', instructions: '', dueDate: '' });
            setShowTaskForm(false);
            setSelectedActivityId('');
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

    const removeTask = async (task) => {
        if (!window.confirm(`Delete task "${task.title}"? Only tasks not yet started by the student can be deleted.`)) return;
        const r = await dispatch(deletePlpTask(task._id));
        if (!r.error) toast.success('Task deleted');
        else toast.error(r.payload || 'Failed to delete task');
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

    const exportRecordDocx = async () => {
        setExportingDocx(true);
        try {
            const response = await api.get(`/plp/records/${id}/export-docx`, { responseType: 'blob' });
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const url = window.URL.createObjectURL(blob);
            const safeStudentName = `${record.student?.firstName || 'student'}-${record.student?.lastName || 'record'}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
            const link = document.createElement('a');
            link.href = url;
            link.download = `plp-${safeStudentName}-${record.academicYear}.docx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('DOCX downloaded');
        } catch (requestError) {
            toast.error(requestError?.response?.data?.message || 'Failed to export DOCX');
        } finally {
            setExportingDocx(false);
        }
    };

    if (loading && !record) return <div className="plp-loading">Loading…</div>;
    if (!record) return <div className="plp-empty">Record not found.</div>;

    const locked = record.status === 'locked';
    const canWrite = !locked && ['teacher', 'admin'].includes(user?.role);
    const isSupervisor = user?.role === 'department_principal';
    const publishedCycles = cycles
        .filter((cycle) => cycle.status === 'published' && cycle.academicYear === record.academicYear)
        .sort((a, b) => Number(a.printOrder || 0) - Number(b.printOrder || 0));

    return (
        <div className="plp-page">
            <div className="plp-header">
                <div>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>← Back</button>
                    <h1>{record.student?.firstName} {record.student?.lastName} — {record.month ? MONTHS[record.month - 1] : 'Month'}</h1>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <span className={`plp-badge plp-badge-${record.level}`}>{record.level}</span>
                        <span className={`plp-badge plp-badge-${record.status}`}>{record.status}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {['teacher', 'admin'].includes(user?.role) && (
                        <button className="btn btn-secondary" onClick={exportRecordDocx} disabled={exportingDocx}>
                            {exportingDocx ? 'Exporting...' : 'Download DOCX'}
                        </button>
                    )}
                    {canWrite && record.status === 'in_progress' && (
                        <button className="btn btn-primary" onClick={handleSubmit}>Submit Record</button>
                    )}
                    {user?.role === 'admin' && record.status === 'locked' && (
                        <button className="btn btn-secondary" onClick={unlockRecordHandler}>Unlock Record</button>
                    )}
                </div>
            </div>

            <div className="plp-record-tabs" role="tablist" aria-label="Student record sections">
                {[
                    { id: 'character', label: 'Character' },
                    { id: 'academic', label: 'Academic' },
                    { id: 'activity', label: 'Activity' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        className={`plp-record-tab${activeTab === tab.id ? ' is-active' : ''}`}
                        onClick={() => {
                            setActiveTab(tab.id);
                            setShowGoalForm(false);
                            setShowTaskForm(false);
                            if (tab.id !== 'activity') {
                                setGoalForm((prev) => ({ ...prev, goalType: tab.id === 'academic' ? 'academic' : 'character' }));
                            }
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'character' && (
                <>
            <div className="plp-section">
                <h2>Student Record Round</h2>
                <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    Assign this existing student record to a published Round. Legacy records can remain unassigned.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="plp-form-group" style={{ marginBottom: 0, minWidth: 280 }}>
                        <label>PLP Round</label>
                        <select value={selectedCycleId} onChange={(event) => setSelectedCycleId(event.target.value)} disabled={!canWrite}>
                            <option value="">Unassigned Round</option>
                            {publishedCycles.map((cycle) => (
                                <option key={cycle._id} value={cycle._id}>{cycle.title} ({cycle.cycleCode})</option>
                            ))}
                        </select>
                    </div>
                    {canWrite && <button className="btn btn-primary btn-sm" onClick={saveRoundAssignment}>Save Round</button>}
                    {canWrite && <button className="btn btn-secondary btn-sm" onClick={deleteRecord}>Delete Record</button>}
                </div>
            </div>

            <div className="plp-section">
                <h2>Trait Scores (0–5)</h2>
                <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    Scores are generated only from trait-linked observation records. Add or update observations to change the score, then save the evidence-based suggestion.
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
                            <strong>{group.monthTitle}</strong>
                            <span>{expandedThemes[group.key] ? 'Hide' : 'Show'}</span>
                        </button>
                        {expandedThemes[group.key] && (
                            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                                {group.rows.map((row) => {
                                    const traitId = String(row?.trait?._id || '');
                                    const suggestion = row?.suggestion || {};
                                    const suggestedScore = suggestion?.suggestedScore;
                                    const evidenceCount = Number(suggestion?.evidenceCount || 0);
                                    const savedScore = row?.saved?.score;
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
                                                    <label>Evidence-based score</label>
                                                    <input
                                                        type="text"
                                                        value={
                                                            suggestedScore !== null && suggestedScore !== undefined
                                                                ? String(suggestedScore)
                                                                : 'No score until observation evidence exists'
                                                        }
                                                        disabled
                                                        readOnly
                                                    />
                                                </div>
                                                {savedScore !== null && savedScore !== undefined && (
                                                    <div className="plp-form-group" style={{ marginBottom: 0 }}>
                                                        <label>Saved score</label>
                                                        <input type="text" value={String(savedScore)} disabled readOnly />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
                {canWrite && (
                    <button className="btn btn-primary btn-sm" onClick={saveScores} style={{ marginTop: 8 }}>Save Evidence-Based Scores</button>
                )}
                <div style={{ marginTop: 12 }}>
                    <strong>Weighted score:</strong> {record.weightedScore?.toFixed(1)}&nbsp;
                    <span className={`plp-badge plp-badge-${record.level}`}>{record.level}</span>
                </div>
            </div>
                </>
            )}

            {(activeTab === 'character' || activeTab === 'academic') && (
                <>
            <div className="plp-section">
                <h2>{activeTab === 'academic' ? 'Academic Goals' : 'Character Goals'}</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                    <select value={selectedGoalId} onChange={(e) => setSelectedGoalId(e.target.value)} style={{ minWidth: 280 }}>
                        <option value="">Select goal</option>
                        {visibleGoals.map((goal) => (
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
                    {visibleGoals.map((goal) => (
                        <div key={goal._id} className="plp-evidence-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                <div>
                                    <strong>{goal.title}</strong>
                                    <div className="plp-evidence-meta">{goal.goalType} · status: {goal.status}</div>
                                </div>
                                {canWrite && (
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                        <select value={goal.status} onChange={(e) => updateGoalStatus(goal._id, e.target.value)}>
                                            <option value="active">active</option>
                                            <option value="completed">completed</option>
                                            <option value="carried_forward">carried_forward</option>
                                            <option value="archived">archived</option>
                                        </select>
                                        <button className="btn btn-secondary btn-sm" onClick={() => removeGoal(goal)}>Delete</button>
                                    </div>
                                )}
                            </div>
                            {canWrite && (
                                <div style={{ marginTop: 10 }}>
                                    <label className="plp-form-group" style={{ display: 'block', marginBottom: 6 }}>
                                        <span>Teacher progress note</span>
                                        <textarea
                                            defaultValue={goal.teacherProgressNote || ''}
                                            placeholder="How far did the student apply this goal?"
                                            onBlur={(event) => {
                                                if (event.target.value !== (goal.teacherProgressNote || '')) {
                                                    updateGoalProgressNote(goal._id, event.target.value);
                                                }
                                            }}
                                        />
                                    </label>
                                </div>
                            )}
                        </div>
                    ))}
                    {visibleGoals.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No {activeGoalType} goals yet.</p>}
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
                                        {task.status === 'assigned' && (
                                            <button className="btn btn-secondary btn-sm" onClick={() => removeTask(task)}>Delete</button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {selectedGoalId && tasks.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No tasks yet for this goal.</p>}
                    {!selectedGoalId && <p style={{ color: 'var(--text-muted)' }}>Select a goal to view tasks.</p>}
                </div>
            </div>
                </>
            )}

            {activeTab === 'character' && (
                <>
            <div className="plp-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0 }}>Personalized Activities</h2>
                    {canWrite && <button className="btn btn-primary btn-sm" onClick={() => { setEditingActivityId(''); setActivityForm({ title: '', instructions: '', traitId: '', goal: '', dueDate: '' }); setShowActivityForm((value) => !value); }}>Add Activity</button>}
                </div>
                {showActivityForm && canWrite && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 14, margin: '14px 0' }}>
                        <div className="plp-form-group"><label>Activity title</label><input value={activityForm.title} onChange={(event) => setActivityForm({ ...activityForm, title: event.target.value })} /></div>
                        <div className="plp-form-group"><label>Instructions</label><textarea value={activityForm.instructions} onChange={(event) => setActivityForm({ ...activityForm, instructions: event.target.value })} /></div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                            <div className="plp-form-group"><label>Character trait</label><select value={activityForm.traitId} onChange={(event) => setActivityForm({ ...activityForm, traitId: event.target.value })}><option value="">Select trait</option>{traitSuggestionRows.map((row) => <option key={row.trait._id} value={row.trait._id}>{row.trait.name}</option>)}</select></div>
                            <div className="plp-form-group"><label>Goal (optional)</label><select value={activityForm.goal} onChange={(event) => setActivityForm({ ...activityForm, goal: event.target.value })}><option value="">No linked goal</option>{goals.map((goal) => <option key={goal._id} value={goal._id}>{goal.title}</option>)}</select></div>
                            <div className="plp-form-group"><label>Due date (optional)</label><input type="date" value={activityForm.dueDate} onChange={(event) => setActivityForm({ ...activityForm, dueDate: event.target.value })} /></div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn btn-primary btn-sm" onClick={saveActivity}>{editingActivityId ? 'Save Activity' : 'Add Activity'}</button><button className="btn btn-secondary btn-sm" onClick={() => setShowActivityForm(false)}>Cancel</button></div>
                    </div>
                )}
                <ActivityGroups activities={activities} canWrite={canWrite} onEdit={editActivity} onDelete={removeActivity} onAssign={handleActivityForTask} />
            </div>

            <div className="plp-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h2 style={{ margin: 0 }}>Evidence ({record.evidenceCount})</h2>
                    {canWrite && <button className="btn btn-secondary btn-sm" onClick={() => setShowEvidenceForm(!showEvidenceForm)}>+ Add Evidence</button>}
                </div>

                {showEvidenceForm && canWrite && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <div className="plp-form-group">
                            <label>Character Trait</label>
                            <select value={evForm.traitId} onChange={(e) => setEvForm({ ...evForm, traitId: e.target.value })}>
                                <option value="">Select trait</option>
                                {traitSuggestionRows.map((row) => (
                                    <option key={row.trait._id} value={row.trait._id}>{row.trait.name}</option>
                                ))}
                            </select>
                        </div>
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
                            <button className="btn btn-primary btn-sm" onClick={addEvidence}>Save Observation</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowEvidenceForm(false)}>Cancel</button>
                        </div>
                    </div>
                )}

                {evidence.map((ev) => (
                    <div key={ev._id} className="plp-evidence-item">
                        {editingEvidenceId === ev._id ? (
                            <div>
                                <textarea
                                    value={editEvidenceNote}
                                    onChange={(event) => setEditEvidenceNote(event.target.value)}
                                    maxLength={1000}
                                />
                                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                    <button className="btn btn-primary btn-sm" onClick={() => saveEditEvidence(ev._id)}>Save</button>
                                    <button className="btn btn-secondary btn-sm" onClick={cancelEditEvidence}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <span className={`plp-badge plp-badge-draft`} style={{ marginBottom: 4 }}>{ev.type?.replace('_', ' ')}</span>
                                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{ev.note}</p>
                                    </div>
                                    {canWrite && (
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {ev.source !== 'ai_classified' && (
                                                <button className="btn btn-secondary btn-sm" onClick={() => startEditEvidence(ev)}>Edit</button>
                                            )}
                                            <button className="btn btn-secondary btn-sm" onClick={() => removeEvidence(ev._id)}>×</button>
                                        </div>
                                    )}
                                </div>
                                <div className="plp-evidence-meta">
                                    {ev.traitId?.name ? `${ev.traitId.name} · ` : ''}
                                    {ev.teacher?.firstName} {ev.teacher?.lastName} · {new Date(ev.createdAt).toLocaleDateString()}
                                </div>
                            </>
                        )}
                    </div>
                ))}
                {evidence.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No evidence recorded yet.</p>}
            </div>
                </>
            )}

            {activeTab === 'activity' && (
                <>
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
                </>
            )}
        </div>
    );
}
