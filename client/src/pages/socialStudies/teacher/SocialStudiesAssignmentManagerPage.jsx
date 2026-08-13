import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    fetchLesson, createAssignment, publishAssignment,
    selectActiveLesson, selectActiveLessonLoading,
    clearActiveLesson,
} from '../../../store/slices/socialStudiesSlice';
import { selectUser } from '../../../store/slices/authSlice';
import FeatureGate from '../../../components/FeatureGate';
import '../SocialStudies.css';
import api from '../../../config/api';

const ASSIGNMENT_TYPES = [
    { value: 'classwork', label: 'Classwork', color: '#eff6ff', textColor: '#1d4ed8' },
    { value: 'homework', label: 'Homework', color: '#fef9c3', textColor: '#854d0e' },
    { value: 'quiz', label: 'Quiz', color: '#f0fdf4', textColor: '#166534' },
];

export default function SocialStudiesAssignmentManagerPage() {
    const [searchParams] = useSearchParams();
    const lessonId = searchParams.get('lessonId');
    const unitId = searchParams.get('unitId');
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const lesson = useSelector(selectActiveLesson);
    const loading = useSelector(selectActiveLessonLoading);
    const user = useSelector(selectUser);

    const [classes, setClasses] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [selectedQuestions, setSelectedQuestions] = useState([]);
    const [allSelected, setAllSelected] = useState(true);
    const [saving, setSaving] = useState(false);
    const [createdAssignment, setCreatedAssignment] = useState(null);

    const [form, setForm] = useState({
        title: '',
        assignmentType: 'classwork',
        classId: '',
        subjectId: '',
        dueDate: '',
        timeLimit: '',
        maxAttempts: '1',
        instructions: '',
        notifyStudents: true,
        notifyParents: true,
    });

    useEffect(() => {
        if (lessonId) dispatch(fetchLesson(lessonId));
        return () => dispatch(clearActiveLesson());
    }, [dispatch, lessonId]);

    useEffect(() => {
        if (lesson) {
            setForm(f => ({ ...f, title: lesson.title ? `${lesson.title} – Practice` : '' }));
            const activeQs = (lesson.questions || []).filter(q => q.isActive !== false);
            setSelectedQuestions(activeQs.map(q => q._id));
        }
    }, [lesson]);

    useEffect(() => {
        const loadMeta = async () => {
            try {
                const [classRes, subjectRes] = await Promise.all([
                    api.get('/classes', { params: { limit: 100 } }),
                    api.get('/subjects', { params: { limit: 100 } }),
                ]);
                setClasses(classRes.data.data?.classes || classRes.data.data || []);
                setSubjects(subjectRes.data.data?.subjects || subjectRes.data.data || []);
            } catch { /* ignore */ }
        };
        loadMeta();
    }, []);

    const toggleQuestion = (qId) => {
        setSelectedQuestions(prev =>
            prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]
        );
    };

    const toggleAll = () => {
        if (allSelected) { setSelectedQuestions([]); setAllSelected(false); }
        else {
            setSelectedQuestions((lesson?.questions || []).filter(q => q.isActive !== false).map(q => q._id));
            setAllSelected(true);
        }
    };

    const handleCreate = async (andPublish = false) => {
        if (!form.classId) return toast.error('Select a class');
        if (!form.title.trim()) return toast.error('Title is required');
        if (selectedQuestions.length === 0) return toast.error('Select at least one question');

        setSaving(true);
        try {
            const payload = {
                unitId,
                lessonId,
                classId: form.classId,
                subjectId: form.subjectId || undefined,
                title: form.title.trim(),
                assignmentType: form.assignmentType,
                instructions: form.instructions.trim(),
                questionIds: allSelected ? [] : selectedQuestions,
                dueDate: form.dueDate || null,
                timeLimit: form.timeLimit ? Number(form.timeLimit) * 60 : null,
                maxAttempts: Number(form.maxAttempts) || 1,
                notifyStudents: form.notifyStudents,
                notifyParents: form.notifyParents,
            };

            const assignment = await dispatch(createAssignment(payload)).unwrap();

            if (andPublish) {
                await dispatch(publishAssignment(assignment._id)).unwrap();
                toast.success('Assignment created and published! Students have been notified.');
            } else {
                toast.success('Assignment saved as draft');
            }

            setCreatedAssignment(assignment);
        } catch (err) {
            toast.error(err || 'Failed');
        } finally {
            setSaving(false);
        }
    };

    const activeQuestions = (lesson?.questions || []).filter(q => q.isActive !== false);

    if (loading) return <div style={{ padding: 32 }}>Loading lesson…</div>;
    if (!lesson) return <div style={{ padding: 32, color: '#888' }}>Lesson not found. Go back and select a lesson.</div>;

    if (createdAssignment) {
        return (
                <div className="ss-page" style={{ padding: 32, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                    <h2>Assignment {createdAssignment.status === 'published' ? 'Published' : 'Created'}!</h2>
                    <p style={{ color: '#666' }}>"{createdAssignment.title}" has been {createdAssignment.status === 'published' ? 'sent to students' : 'saved as a draft'}.</p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
                        <button onClick={() => navigate(`/portal/social-studies/units/${unitId}`)} className="btn btn-primary">Back to Unit</button>
                        <button onClick={() => navigate(`/portal/social-studies/assignments/${createdAssignment._id}/results`)} className="btn btn-secondary">View Results</button>
                    </div>
                </div>
        );
    }

    return (
            <div className="ss-page" style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
                <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: '0 0 16px', display: 'block' }}>← Back</button>
                <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Assign from Lesson</h1>
                <p style={{ margin: '0 0 24px', color: '#666' }}>Lesson: <strong>{lesson.title}</strong> · {activeQuestions.length} questions available</p>

                {/* Assignment Type */}
                <label style={labelStyle}>Assignment Type *</label>
                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                    {ASSIGNMENT_TYPES.map(t => (
                        <button key={t.value} onClick={() => setForm(f => ({ ...f, assignmentType: t.value }))} style={{ flex: 1, padding: '10px', border: `2px solid ${form.assignmentType === t.value ? t.textColor : '#e5e7eb'}`, borderRadius: 10, background: form.assignmentType === t.value ? t.color : '#fff', color: form.assignmentType === t.value ? t.textColor : '#374151', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Title */}
                <label style={labelStyle}>Title *</label>
                <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Assignment title" />

                {/* Class + Subject */}
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Class *</label>
                        <select style={inputStyle} value={form.classId} onChange={e => setForm(f => ({ ...f, classId: e.target.value }))}>
                            <option value="">Select class…</option>
                            {classes.map(c => <option key={c._id} value={c._id}>{c.name} {c.section ? `(${c.section})` : ''}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Subject (optional)</label>
                        <select style={inputStyle} value={form.subjectId} onChange={e => setForm(f => ({ ...f, subjectId: e.target.value }))}>
                            <option value="">No subject</option>
                            {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>

                {/* Due date + Time limit */}
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Due Date</label>
                        <input type="date" style={inputStyle} value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Time Limit (minutes, optional)</label>
                        <input type="number" style={inputStyle} value={form.timeLimit} onChange={e => setForm(f => ({ ...f, timeLimit: e.target.value }))} placeholder="e.g. 30" min={1} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Max Attempts</label>
                        <input type="number" style={inputStyle} value={form.maxAttempts} onChange={e => setForm(f => ({ ...f, maxAttempts: e.target.value }))} min={1} max={5} />
                    </div>
                </div>

                {/* Instructions */}
                <label style={{ ...labelStyle, marginTop: 16 }}>Instructions</label>
                <textarea style={{ ...inputStyle, minHeight: 72 }} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Any special instructions for students…" />

                {/* Notifications */}
                <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                        <input type="checkbox" checked={form.notifyStudents} onChange={e => setForm(f => ({ ...f, notifyStudents: e.target.checked }))} />
                        Notify students
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                        <input type="checkbox" checked={form.notifyParents} onChange={e => setForm(f => ({ ...f, notifyParents: e.target.checked }))} />
                        Notify parents when graded
                    </label>
                </div>

                {/* Question Selection */}
                <div style={{ marginTop: 24, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>Select Questions ({selectedQuestions.length} / {activeQuestions.length})</span>
                        <button onClick={toggleAll} style={{ fontSize: 13, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
                            {allSelected ? 'Deselect all' : 'Select all'}
                        </button>
                    </div>
                    {activeQuestions.length === 0 ? (
                        <p style={{ padding: 16, color: '#888', margin: 0 }}>No questions in this lesson. Edit the lesson to add questions first.</p>
                    ) : (
                        activeQuestions.map((q, idx) => (
                            <label key={q._id} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: idx < activeQuestions.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer', alignItems: 'flex-start' }}>
                                <input type="checkbox" checked={selectedQuestions.includes(q._id)} onChange={() => toggleQuestion(q._id)} style={{ marginTop: 2 }} />
                                <div style={{ flex: 1 }}>
                                    <p style={{ margin: 0, fontSize: 14 }}><strong>Q{idx + 1}.</strong> {q.questionText}</p>
                                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>{q.questionType.replace('_', ' ')} · {q.difficulty} · {q.points} pt{q.points !== 1 ? 's' : ''}</p>
                                </div>
                            </label>
                        ))
                    )}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                    <button onClick={() => handleCreate(false)} className="btn btn-secondary" disabled={saving}>Save as Draft</button>
                    <button onClick={() => handleCreate(true)} className="btn btn-primary" disabled={saving}>
                        {saving ? 'Publishing…' : 'Publish & Notify Students'}
                    </button>
                </div>
            </div>
    );
}

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#374151' };
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
