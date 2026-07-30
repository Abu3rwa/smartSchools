import { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import api from '../../config/api';
import {
    fetchGrammarTests,
    createGrammarTest,
    updateGrammarTest,
    deleteGrammarTest,
    toggleGrammarTest,
    publishGrammarTest,
    fetchGrammarTestPool,
    updateGrammarTestPool,
    regenerateGrammarTestQuestion,
    clearPool,
    selectGrammarTests,
    selectGrammarTestsLoading,
    selectGrammarTestPool,
    selectGrammarTestPoolLoading,
    selectGrammarTestPoolError,
} from '../../store/slices/grammarTestSlice';
import { selectSubjects } from '../../store/slices/subjectSlice';
import { selectUser } from '../../store/slices/authSlice';
import { selectCurrentAcademicYear, selectSelectedSemester } from '../../store/slices/uiSlice';
import FeatureGate from '../../components/FeatureGate';
import './GrammarTestPage.css';

// ─── Constants ─────────────────────────────────────────────────────────────

const GRAMMAR_LEVEL_OPTIONS = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'elementary', label: 'Elementary' },
    { value: 'pre_intermediate', label: 'Pre-Intermediate' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'upper_intermediate', label: 'Upper Intermediate' },
    { value: 'advanced', label: 'Advanced' },
];

const QUESTION_TYPE_OPTIONS = [
    { value: 'multiple_choice', label: 'Multiple Choice' },
    { value: 'true_false', label: 'True / False' },
];

const DIFFICULTY_OPTIONS = [
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' },
];

const RESULTS_VISIBILITY_OPTIONS = [
    { value: 'immediate', label: 'Show results immediately after submission' },
    { value: 'manual_release', label: 'Hold results until teacher releases them' },
];

const defaultForm = (semester = 1) => ({
    title: '',
    classId: '',
    subjectId: '',
    semester: semester || 1,
    students: [],
    grammarLevels: GRAMMAR_LEVEL_OPTIONS.map(o => o.value),
    practiceConfig: {
        questionLimit: '',
        timeLimitSeconds: '',
        allowedQuestionTypes: ['multiple_choice', 'true_false'],
        allowedDifficulties: ['easy', 'medium', 'hard'],
        availability: { startAt: '', endAt: '' },
        lockStudentOptions: false,
    },
    assessmentConfig: {
        maxMarks: '100',
        passMarks: '50',
        resultsVisibility: 'immediate',
        resultsReleaseAt: '',
    },
    preGeneratedQuestionCount: '10',
    notifyParents: true,
    notifyStudents: true,
});

const isEnglishSubject = (name = '') => {
    const n = name.toLowerCase();
    return n.includes('english') || n.includes('language art') || n.includes('ela') || n.includes('grammar');
};

// ─── Component ─────────────────────────────────────────────────────────────

const GrammarTestPage = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation(['standardAssign']);

    const tests = useSelector(selectGrammarTests);
    const loading = useSelector(selectGrammarTestsLoading);
    const poolData = useSelector(selectGrammarTestPool);
    const poolLoading = useSelector(selectGrammarTestPoolLoading);
    const poolError = useSelector(selectGrammarTestPoolError);
    const subjects = useSelector(selectSubjects);
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const selectedSemester = useSelector(selectSelectedSemester);

    const [classes, setClasses] = useState([]);
    const [students, setStudents] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(() => defaultForm(selectedSemester));
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [filters, setFilters] = useState({ classId: '', subjectId: '', semester: '' });
    const [showPoolModal, setShowPoolModal] = useState(false);
    const [poolTestId, setPoolTestId] = useState(null);
    const [editedQuestions, setEditedQuestions] = useState([]);
    const [savingPool, setSavingPool] = useState(false);
    const [regeneratingIdx, setRegeneratingIdx] = useState(null);
    const [toggleLoadingId, setToggleLoadingId] = useState(null);
    const [publishLoadingId, setPublishLoadingId] = useState(null);
    const [deleteLoadingId, setDeleteLoadingId] = useState(null);

    useEffect(() => {
        dispatch(fetchGrammarTests({ academicYear, semester: selectedSemester }));
        loadClasses();
    }, [dispatch, academicYear, selectedSemester]);

    useEffect(() => {
        if (!editingId) {
            setFormData(prev => ({ ...prev, semester: selectedSemester || prev.semester }));
        }
    }, [selectedSemester, editingId]);

    const loadClasses = async () => {
        try {
            const res = await api.get('/classes', { params: { academicYear } });
            setClasses(res.data.data?.classes || []);
        } catch { /* silent */ }
    };

    const loadStudents = async (classId) => {
        if (!classId) { setStudents([]); return; }
        try {
            const res = await api.get('/students', { params: { classId, academicYear, status: 'active' } });
            setStudents(res.data.data?.students || []);
        } catch { /* silent */ }
    };

    // ── Filtering ────────────────────────────────────────────────────────

    const filteredTests = useMemo(() => {
        return tests.filter(test => {
            if (filters.classId && test.class?._id !== filters.classId) return false;
            if (filters.subjectId && test.subject?._id !== filters.subjectId) return false;
            if (filters.semester && String(test.semester) !== String(filters.semester)) return false;
            return true;
        });
    }, [tests, filters]);

    const filterOptions = useMemo(() => {
        const classesMap = new Map();
        const subjectsMap = new Map();
        const semestersSet = new Set();
        tests.forEach(test => {
            if (test.class?._id) classesMap.set(test.class._id, test.class.name);
            if (test.subject?._id) subjectsMap.set(test.subject._id, test.subject.name);
            if (test.semester) semestersSet.add(test.semester);
        });
        return {
            classes: Array.from(classesMap.entries()).map(([id, name]) => ({ id, name })),
            subjects: Array.from(subjectsMap.entries()).map(([id, name]) => ({ id, name })),
            semesters: Array.from(semestersSet).sort(),
        };
    }, [tests]);

    // ── Selected class for form ───────────────────────────────────────────

    const selectedClass = classes.find(c => c._id === formData.classId);
    const classSubjectIds = new Set((selectedClass?.subjects || []).map(s => String(s.subject?._id || s.subject || '')));
    const classSubjects = subjects.filter(s => classSubjectIds.has(s._id));
    const englishSubjects = classSubjects.filter(s => isEnglishSubject(s.name || '') || isEnglishSubject(s.code || ''));
    const subjectOptions = englishSubjects.length > 0 ? englishSubjects : classSubjects;

    // ── Form handlers ────────────────────────────────────────────────────

    const resetModal = () => {
        setEditingId(null);
        setFormData(defaultForm(selectedSemester));
        setShowAdvanced(false);
        setStudents([]);
    };

    const openCreate = () => { resetModal(); setShowModal(true); };

    const closeModal = () => { setShowModal(false); resetModal(); };

    const handleClassChange = (classId) => {
        setFormData(prev => ({ ...prev, classId, subjectId: '', students: [] }));
        loadStudents(classId);
    };

    const handleEdit = (test) => {
        setEditingId(test._id);
        setFormData({
            title: test.title || '',
            classId: test.class?._id || '',
            subjectId: test.subject?._id || '',
            semester: test.semester || selectedSemester || 1,
            students: (test.students || []).map(s => s._id || s),
            grammarLevels: test.grammarLevels || GRAMMAR_LEVEL_OPTIONS.map(o => o.value),
            practiceConfig: {
                questionLimit: test.practiceConfig?.questionLimit || '',
                timeLimitSeconds: test.practiceConfig?.timeLimitSeconds
                    ? String(Math.round(test.practiceConfig.timeLimitSeconds / 60))
                    : '',
                allowedQuestionTypes: test.practiceConfig?.allowedQuestionTypes || ['multiple_choice', 'true_false'],
                allowedDifficulties: test.practiceConfig?.allowedDifficulties || ['easy', 'medium', 'hard'],
                availability: {
                    startAt: test.practiceConfig?.availability?.startAt
                        ? new Date(test.practiceConfig.availability.startAt).toISOString().slice(0, 16) : '',
                    endAt: test.practiceConfig?.availability?.endAt
                        ? new Date(test.practiceConfig.availability.endAt).toISOString().slice(0, 16) : '',
                },
                lockStudentOptions: Boolean(test.practiceConfig?.lockStudentOptions),
            },
            assessmentConfig: {
                maxMarks: String(test.assessmentConfig?.maxMarks || 100),
                passMarks: String(test.assessmentConfig?.passMarks || 50),
                resultsVisibility: test.assessmentConfig?.resultsVisibility || 'immediate',
                resultsReleaseAt: test.assessmentConfig?.resultsReleaseAt
                    ? new Date(test.assessmentConfig.resultsReleaseAt).toISOString().slice(0, 16) : '',
            },
            preGeneratedQuestionCount: String(test.questionWorkflow?.preGeneratedQuestionCount || 10),
            notifyParents: Boolean(test.notifyParents ?? true),
            notifyStudents: Boolean(test.notifyStudents ?? true),
        });
        if (test.class?._id) loadStudents(test.class._id);
        setShowAdvanced(true);
        setShowModal(true);
    };

    const handleToggleLevel = (level) => {
        setFormData(prev => {
            const current = prev.grammarLevels || [];
            const updated = current.includes(level)
                ? current.filter(l => l !== level)
                : [...current, level];
            return { ...prev, grammarLevels: updated };
        });
    };

    const handleToggleQuestionType = (type) => {
        setFormData(prev => {
            const current = prev.practiceConfig.allowedQuestionTypes || [];
            const updated = current.includes(type)
                ? current.filter(t => t !== type)
                : [...current, type];
            return { ...prev, practiceConfig: { ...prev.practiceConfig, allowedQuestionTypes: updated } };
        });
    };

    const handleToggleDifficulty = (diff) => {
        setFormData(prev => {
            const current = prev.practiceConfig.allowedDifficulties || [];
            const updated = current.includes(diff)
                ? current.filter(d => d !== diff)
                : [...current, diff];
            return { ...prev, practiceConfig: { ...prev.practiceConfig, allowedDifficulties: updated } };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.classId) { toast.error('Please select a class'); return; }
        if (!formData.subjectId) { toast.error('Please select a subject'); return; }
        if (!formData.title.trim()) { toast.error('Please enter a test title'); return; }
        if (!formData.grammarLevels || formData.grammarLevels.length === 0) {
            toast.error('Please select at least one grammar level'); return;
        }
        if (!formData.practiceConfig.allowedQuestionTypes || formData.practiceConfig.allowedQuestionTypes.length === 0) {
            toast.error('Please select at least one question type'); return;
        }

        const maxMarks = parseInt(formData.assessmentConfig.maxMarks, 10) || 100;
        const passMarks = parseInt(formData.assessmentConfig.passMarks, 10) || 50;
        if (passMarks > maxMarks) { toast.error('Pass marks cannot exceed max marks'); return; }

        const startAt = formData.practiceConfig.availability.startAt;
        const endAt = formData.practiceConfig.availability.endAt;
        if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
            toast.error('End date must be after start date'); return;
        }

        setSubmitting(true);
        const timeLimitRaw = parseInt(formData.practiceConfig.timeLimitSeconds, 10);
        const payload = {
            title: formData.title.trim(),
            classId: formData.classId,
            subjectId: formData.subjectId,
            semester: parseInt(formData.semester, 10) || 1,
            students: formData.students,
            grammarLevels: formData.grammarLevels,
            practiceConfig: {
                questionLimit: parseInt(formData.practiceConfig.questionLimit, 10) || null,
                timeLimitSeconds: timeLimitRaw > 0 ? timeLimitRaw * 60 : null,
                allowedQuestionTypes: formData.practiceConfig.allowedQuestionTypes,
                allowedDifficulties: formData.practiceConfig.allowedDifficulties,
                availability: {
                    startAt: startAt ? new Date(startAt).toISOString() : null,
                    endAt: endAt ? new Date(endAt).toISOString() : null,
                },
                lockStudentOptions: formData.practiceConfig.lockStudentOptions,
            },
            assessmentConfig: {
                maxMarks,
                passMarks,
                resultsVisibility: formData.assessmentConfig.resultsVisibility,
                resultsReleaseAt: formData.assessmentConfig.resultsReleaseAt
                    ? new Date(formData.assessmentConfig.resultsReleaseAt).toISOString() : null,
            },
            preGeneratedQuestionCount: parseInt(formData.preGeneratedQuestionCount, 10) || 10,
            notifyParents: formData.notifyParents,
            notifyStudents: formData.notifyStudents,
        };

        try {
            if (editingId) {
                const result = await dispatch(updateGrammarTest({ id: editingId, data: payload }));
                if (updateGrammarTest.fulfilled.match(result)) {
                    toast.success('Grammar test updated successfully');
                    closeModal();
                    dispatch(fetchGrammarTests({ academicYear, semester: selectedSemester }));
                } else {
                    toast.error(result.payload || 'Failed to update grammar test');
                }
            } else {
                const result = await dispatch(createGrammarTest(payload));
                if (createGrammarTest.fulfilled.match(result)) {
                    toast.success('Grammar test created successfully');
                    closeModal();
                    dispatch(fetchGrammarTests({ academicYear, semester: selectedSemester }));
                } else {
                    toast.error(result.payload || 'Failed to create grammar test');
                }
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this grammar test? This cannot be undone.')) return;
        setDeleteLoadingId(id);
        const result = await dispatch(deleteGrammarTest(id));
        setDeleteLoadingId(null);
        if (deleteGrammarTest.fulfilled.match(result)) {
            toast.success('Grammar test deleted');
        } else {
            toast.error(result.payload || 'Failed to delete');
        }
    };

    const handleToggle = async (id) => {
        setToggleLoadingId(id);
        const result = await dispatch(toggleGrammarTest(id));
        setToggleLoadingId(null);
        if (toggleGrammarTest.fulfilled.match(result)) {
            toast.success(result.payload.isEnabled ? 'Test enabled — students can access it' : 'Test disabled — students cannot access it');
        } else {
            toast.error(result.payload || 'Failed to toggle test');
        }
    };

    const handlePublish = async (id) => {
        if (!window.confirm('Publish this grammar test? Students will be able to access the question pool.')) return;
        setPublishLoadingId(id);
        const result = await dispatch(publishGrammarTest(id));
        setPublishLoadingId(null);
        if (publishGrammarTest.fulfilled.match(result)) {
            toast.success('Grammar test published successfully');
        } else {
            toast.error(result.payload || 'Failed to publish');
        }
    };

    // ── Pool editor ──────────────────────────────────────────────────────

    const openPool = async (testId) => {
        setPoolTestId(testId);
        dispatch(clearPool());
        setShowPoolModal(true);
        const result = await dispatch(fetchGrammarTestPool(testId));
        if (fetchGrammarTestPool.fulfilled.match(result)) {
            setEditedQuestions(result.payload?.questions || []);
        }
    };

    useEffect(() => {
        if (poolData?.questions) setEditedQuestions(poolData.questions);
    }, [poolData]);

    const closePool = () => {
        setShowPoolModal(false);
        setPoolTestId(null);
        setEditedQuestions([]);
        dispatch(clearPool());
    };

    const handleSavePool = async () => {
        if (!poolTestId) return;
        setSavingPool(true);
        const result = await dispatch(updateGrammarTestPool({ id: poolTestId, questions: editedQuestions }));
        setSavingPool(false);
        if (updateGrammarTestPool.fulfilled.match(result)) {
            toast.success('Question pool saved');
        } else {
            toast.error(result.payload || 'Failed to save pool');
        }
    };

    const handleRegenQuestion = async (questionIndex) => {
        if (!poolTestId) return;
        const question = editedQuestions[questionIndex];
        setRegeneratingIdx(questionIndex);
        const result = await dispatch(regenerateGrammarTestQuestion({
            id: poolTestId,
            questionIndex,
            questionType: question?.questionType || 'multiple_choice',
            difficulty: question?.difficulty || 'medium',
        }));
        setRegeneratingIdx(null);
        if (regenerateGrammarTestQuestion.fulfilled.match(result)) {
            const updated = [...editedQuestions];
            updated[questionIndex] = result.payload.question;
            setEditedQuestions(updated);
            toast.success('Question regenerated');
        } else {
            toast.error(result.payload || 'Failed to regenerate');
        }
    };

    const updateQuestion = (idx, field, value) => {
        setEditedQuestions(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], [field]: value };
            return updated;
        });
    };

    const isTeacher = user?.role === 'teacher';
    const isAdmin = user?.role === 'admin';

    // ── Status badge helper ───────────────────────────────────────────────

    const getStatusBadge = (test) => {
        const status = test.questionWorkflow?.status || 'draft';
        const enabled = test.isEnabled;
        if (!enabled) return <span className="badge badge-disabled">Disabled</span>;
        if (status === 'published') return <span className="badge badge-published">Published</span>;
        return <span className="badge badge-draft">Draft</span>;
    };

    return (
        <FeatureGate feature="standardsPractice" showUpgradePrompt>
            <div className="grammar-test-page">
                {/* Header */}
                <div className="page-header">
                    <div className="page-header-content">
                        <h1 className="page-title">Grammar Tests</h1>
                        <p className="page-subtitle">
                            Create level-based grammar tests. Teachers have full control over question pools, availability, and results.
                        </p>
                    </div>
                    <button className="btn btn-primary" onClick={openCreate}>
                        + New Grammar Test
                    </button>
                </div>

                {/* Filters */}
                {(filterOptions.classes.length > 1 || filterOptions.subjects.length > 1 || filterOptions.semesters.length > 1) && (
                    <div className="filters-bar">
                        {filterOptions.classes.length > 1 && (
                            <select value={filters.classId} onChange={e => setFilters(f => ({ ...f, classId: e.target.value }))}>
                                <option value="">All Classes</option>
                                {filterOptions.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        )}
                        {filterOptions.subjects.length > 1 && (
                            <select value={filters.subjectId} onChange={e => setFilters(f => ({ ...f, subjectId: e.target.value }))}>
                                <option value="">All Subjects</option>
                                {filterOptions.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        )}
                        {filterOptions.semesters.length > 1 && (
                            <select value={filters.semester} onChange={e => setFilters(f => ({ ...f, semester: e.target.value }))}>
                                <option value="">All Semesters</option>
                                {filterOptions.semesters.map(s => <option key={s} value={s}>Semester {s}</option>)}
                            </select>
                        )}
                        {(filters.classId || filters.subjectId || filters.semester) && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ classId: '', subjectId: '', semester: '' })}>
                                Clear Filters
                            </button>
                        )}
                    </div>
                )}

                {/* Test List */}
                {loading ? (
                    <div className="loading-state"><div className="spinner" /></div>
                ) : filteredTests.length === 0 ? (
                    <div className="empty-state">
                        <p>No grammar tests yet.</p>
                        <button className="btn btn-primary" onClick={openCreate}>Create your first grammar test</button>
                    </div>
                ) : (
                    <div className="assign-list">
                        {filteredTests.map(test => (
                            <div key={test._id} className={`assign-card${!test.isEnabled ? ' assign-card--disabled' : ''}`}>
                                <div className="assign-card-header">
                                    <div className="assign-card-title-row">
                                        <h3 className="assign-card-title">{test.title}</h3>
                                        {getStatusBadge(test)}
                                    </div>
                                    <div className="assign-card-meta">
                                        <span>{test.class?.name || '—'}</span>
                                        <span>·</span>
                                        <span>{test.subject?.name || '—'}</span>
                                        {test.semester && <><span>·</span><span>Sem {test.semester}</span></>}
                                    </div>
                                    <div className="assign-card-levels">
                                        {(test.grammarLevels || []).map(level => (
                                            <span key={level} className="level-chip">
                                                {GRAMMAR_LEVEL_OPTIONS.find(o => o.value === level)?.label || level}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="assign-card-stats">
                                    <div className="stat">
                                        <span className="stat-label">Questions</span>
                                        <span className="stat-value">{test.questionWorkflow?.preGeneratedQuestionCount || 10}</span>
                                    </div>
                                    {test.practiceConfig?.timeLimitSeconds && (
                                        <div className="stat">
                                            <span className="stat-label">Time Limit</span>
                                            <span className="stat-value">{Math.round(test.practiceConfig.timeLimitSeconds / 60)} min</span>
                                        </div>
                                    )}
                                    <div className="stat">
                                        <span className="stat-label">Max Marks</span>
                                        <span className="stat-value">{test.assessmentConfig?.maxMarks || 100}</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-label">Students</span>
                                        <span className="stat-value">{(test.students || []).length === 0 ? 'Whole Class' : (test.students || []).length}</span>
                                    </div>
                                </div>

                                <div className="assign-card-actions">
                                    {/* Enable/Disable toggle */}
                                    <button
                                        className={`btn btn-sm ${test.isEnabled ? 'btn-warning' : 'btn-success'}`}
                                        onClick={() => handleToggle(test._id)}
                                        disabled={toggleLoadingId === test._id}
                                        title={test.isEnabled ? 'Disable this test (students cannot access it)' : 'Enable this test (students can access it)'}
                                    >
                                        {toggleLoadingId === test._id ? '…' : test.isEnabled ? 'Disable' : 'Enable'}
                                    </button>

                                    {/* Publish */}
                                    {test.questionWorkflow?.status !== 'published' && (
                                        <button
                                            className="btn btn-sm btn-success"
                                            onClick={() => handlePublish(test._id)}
                                            disabled={publishLoadingId === test._id}
                                            title="Publish the question pool so students can take the test"
                                        >
                                            {publishLoadingId === test._id ? 'Publishing…' : 'Publish'}
                                        </button>
                                    )}

                                    {/* View/Edit Question Pool */}
                                    <button className="btn btn-sm btn-secondary" onClick={() => openPool(test._id)}>
                                        Question Pool
                                    </button>

                                    {/* Edit */}
                                    <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(test)}>
                                        Edit
                                    </button>

                                    {/* Delete */}
                                    <button
                                        className="btn btn-sm btn-danger"
                                        onClick={() => handleDelete(test._id)}
                                        disabled={deleteLoadingId === test._id}
                                    >
                                        {deleteLoadingId === test._id ? 'Deleting…' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Create / Edit Modal */}
                {showModal && (
                    <div className="modal-overlay" onClick={closeModal}>
                        <div className="modal-container modal-lg" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingId ? 'Edit Grammar Test' : 'Create Grammar Test'}</h2>
                                <button className="modal-close" onClick={closeModal}>✕</button>
                            </div>

                            <form className="modal-body" onSubmit={handleSubmit}>
                                {/* Basic Info */}
                                <section className="form-section">
                                    <h3 className="form-section-title">Basic Information</h3>
                                    <div className="form-group">
                                        <label>Test Title *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Grammar Assessment – Unit 4"
                                            value={formData.title}
                                            onChange={e => setFormData(f => ({ ...f, title: e.target.value }))}
                                            required
                                        />
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Class *</label>
                                            <select
                                                value={formData.classId}
                                                onChange={e => handleClassChange(e.target.value)}
                                                required
                                                disabled={Boolean(editingId)}
                                            >
                                                <option value="">Select class…</option>
                                                {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Subject (English / Language Arts) *</label>
                                            <select
                                                value={formData.subjectId}
                                                onChange={e => setFormData(f => ({ ...f, subjectId: e.target.value }))}
                                                required
                                                disabled={!formData.classId || Boolean(editingId)}
                                            >
                                                <option value="">Select subject…</option>
                                                {subjectOptions.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Semester</label>
                                            <select
                                                value={formData.semester}
                                                onChange={e => setFormData(f => ({ ...f, semester: e.target.value }))}
                                            >
                                                <option value="1">Semester 1</option>
                                                <option value="2">Semester 2</option>
                                            </select>
                                        </div>
                                    </div>
                                </section>

                                {/* Grammar Levels */}
                                <section className="form-section">
                                    <h3 className="form-section-title">Grammar Levels</h3>
                                    <p className="form-hint">Select which grammar levels to include in this test.</p>
                                    <div className="checkbox-group-row">
                                        {GRAMMAR_LEVEL_OPTIONS.map(opt => (
                                            <label key={opt.value} className="checkbox-pill">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.grammarLevels.includes(opt.value)}
                                                    onChange={() => handleToggleLevel(opt.value)}
                                                />
                                                {opt.label}
                                            </label>
                                        ))}
                                    </div>
                                    <div className="quick-select-row">
                                        <button type="button" className="btn btn-xs btn-ghost" onClick={() => setFormData(f => ({ ...f, grammarLevels: ['beginner'] }))}>
                                            Beginner only
                                        </button>
                                        <button type="button" className="btn btn-xs btn-ghost" onClick={() => setFormData(f => ({ ...f, grammarLevels: GRAMMAR_LEVEL_OPTIONS.map(o => o.value) }))}>
                                            All levels
                                        </button>
                                    </div>
                                </section>

                                {/* Advanced Settings Toggle */}
                                <div className="advanced-toggle-row">
                                    <button type="button" className="advanced-toggle" onClick={() => setShowAdvanced(v => !v)}>
                                        {showAdvanced ? '− Hide Advanced Settings' : '+ Show Advanced Settings'}
                                    </button>
                                </div>

                                {showAdvanced && (
                                    <>
                                        {/* Question Settings */}
                                        <section className="form-section">
                                            <h3 className="form-section-title">Question Settings</h3>
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label>Questions to Generate (pool size)</label>
                                                    <input
                                                        type="number" min="1" max="50" placeholder="10"
                                                        value={formData.preGeneratedQuestionCount}
                                                        onChange={e => setFormData(f => ({ ...f, preGeneratedQuestionCount: e.target.value }))}
                                                    />
                                                    <span className="form-hint">Max 50 questions</span>
                                                </div>
                                                <div className="form-group">
                                                    <label>Questions Per Session</label>
                                                    <input
                                                        type="number" min="1" placeholder="Leave blank = all"
                                                        value={formData.practiceConfig.questionLimit}
                                                        onChange={e => setFormData(f => ({ ...f, practiceConfig: { ...f.practiceConfig, questionLimit: e.target.value } }))}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Time Limit (minutes)</label>
                                                    <input
                                                        type="number" min="1" placeholder="No limit"
                                                        value={formData.practiceConfig.timeLimitSeconds}
                                                        onChange={e => setFormData(f => ({ ...f, practiceConfig: { ...f.practiceConfig, timeLimitSeconds: e.target.value } }))}
                                                    />
                                                </div>
                                            </div>

                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label>Question Types</label>
                                                    <div className="checkbox-group-row">
                                                        {QUESTION_TYPE_OPTIONS.map(opt => (
                                                            <label key={opt.value} className="checkbox-pill">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={formData.practiceConfig.allowedQuestionTypes.includes(opt.value)}
                                                                    onChange={() => handleToggleQuestionType(opt.value)}
                                                                />
                                                                {opt.label}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="form-group">
                                                    <label>Difficulty Levels</label>
                                                    <div className="checkbox-group-row">
                                                        {DIFFICULTY_OPTIONS.map(opt => (
                                                            <label key={opt.value} className="checkbox-pill">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={formData.practiceConfig.allowedDifficulties.includes(opt.value)}
                                                                    onChange={() => handleToggleDifficulty(opt.value)}
                                                                />
                                                                {opt.label}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.practiceConfig.lockStudentOptions}
                                                        onChange={e => setFormData(f => ({ ...f, practiceConfig: { ...f.practiceConfig, lockStudentOptions: e.target.checked } }))}
                                                    />
                                                    Lock student options (students cannot choose their own difficulty or question type)
                                                </label>
                                            </div>
                                        </section>

                                        {/* Availability */}
                                        <section className="form-section">
                                            <h3 className="form-section-title">Availability Window</h3>
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label>Opens At</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={formData.practiceConfig.availability.startAt}
                                                        onChange={e => setFormData(f => ({ ...f, practiceConfig: { ...f.practiceConfig, availability: { ...f.practiceConfig.availability, startAt: e.target.value } } }))}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Closes At</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={formData.practiceConfig.availability.endAt}
                                                        onChange={e => setFormData(f => ({ ...f, practiceConfig: { ...f.practiceConfig, availability: { ...f.practiceConfig.availability, endAt: e.target.value } } }))}
                                                    />
                                                </div>
                                            </div>
                                        </section>

                                        {/* Assessment Config */}
                                        <section className="form-section">
                                            <h3 className="form-section-title">Assessment Scoring</h3>
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label>Max Marks</label>
                                                    <input
                                                        type="number" min="1"
                                                        value={formData.assessmentConfig.maxMarks}
                                                        onChange={e => setFormData(f => ({ ...f, assessmentConfig: { ...f.assessmentConfig, maxMarks: e.target.value } }))}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Pass Marks</label>
                                                    <input
                                                        type="number" min="0"
                                                        value={formData.assessmentConfig.passMarks}
                                                        onChange={e => setFormData(f => ({ ...f, assessmentConfig: { ...f.assessmentConfig, passMarks: e.target.value } }))}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Results Visibility</label>
                                                    <select
                                                        value={formData.assessmentConfig.resultsVisibility}
                                                        onChange={e => setFormData(f => ({ ...f, assessmentConfig: { ...f.assessmentConfig, resultsVisibility: e.target.value } }))}
                                                    >
                                                        {RESULTS_VISIBILITY_OPTIONS.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            {formData.assessmentConfig.resultsVisibility === 'manual_release' && (
                                                <div className="form-group">
                                                    <label>Scheduled Release Date &amp; Time (optional)</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={formData.assessmentConfig.resultsReleaseAt}
                                                        onChange={e => setFormData(f => ({ ...f, assessmentConfig: { ...f.assessmentConfig, resultsReleaseAt: e.target.value } }))}
                                                    />
                                                </div>
                                            )}
                                        </section>

                                        {/* Student Scope */}
                                        {students.length > 0 && (
                                            <section className="form-section">
                                                <h3 className="form-section-title">Assign To</h3>
                                                <p className="form-hint">Leave all unselected to assign to the whole class.</p>
                                                <div className="student-checkboxes">
                                                    {students.map(s => (
                                                        <label key={s._id} className="checkbox-pill">
                                                            <input
                                                                type="checkbox"
                                                                checked={formData.students.includes(s._id)}
                                                                onChange={e => {
                                                                    const id = s._id;
                                                                    setFormData(f => ({
                                                                        ...f,
                                                                        students: e.target.checked
                                                                            ? [...f.students, id]
                                                                            : f.students.filter(sid => sid !== id),
                                                                    }));
                                                                }}
                                                            />
                                                            {s.firstName} {s.lastName}
                                                        </label>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {/* Notifications */}
                                        {!editingId && (
                                            <section className="form-section">
                                                <h3 className="form-section-title">Notifications</h3>
                                                <div className="checkbox-group-row">
                                                    <label className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.notifyParents}
                                                            onChange={e => setFormData(f => ({ ...f, notifyParents: e.target.checked }))}
                                                        />
                                                        Notify parents
                                                    </label>
                                                    <label className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.notifyStudents}
                                                            onChange={e => setFormData(f => ({ ...f, notifyStudents: e.target.checked }))}
                                                        />
                                                        Notify students
                                                    </label>
                                                </div>
                                            </section>
                                        )}
                                    </>
                                )}

                                <div className="modal-footer">
                                    <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                                        {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Create Grammar Test'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Question Pool Modal */}
                {showPoolModal && (
                    <div className="modal-overlay" onClick={closePool}>
                        <div className="modal-container modal-xl" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Question Pool Editor</h2>
                                <button className="modal-close" onClick={closePool}>✕</button>
                            </div>
                            <div className="modal-body">
                                {poolLoading ? (
                                    <div className="loading-state"><div className="spinner" /></div>
                                ) : poolError ? (
                                    <div className="error-state">{poolError}</div>
                                ) : (
                                    <>
                                        <p className="pool-hint">
                                            Edit questions directly, or regenerate individual questions from the grammar bank.
                                            <strong> Save changes</strong> then <strong>Publish</strong> to release to students.
                                        </p>
                                        <div className="question-pool-list">
                                            {editedQuestions.map((q, idx) => (
                                                <div key={q._id || idx} className="question-pool-item">
                                                    <div className="question-pool-item-header">
                                                        <span className="question-number">Q{idx + 1}</span>
                                                        <span className="question-meta">
                                                            {q.grammarLevel?.replace('_', ' ')} · {q.questionType?.replace('_', ' ')} · {q.difficulty}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="btn btn-xs btn-ghost"
                                                            onClick={() => handleRegenQuestion(idx)}
                                                            disabled={regeneratingIdx === idx}
                                                        >
                                                            {regeneratingIdx === idx ? 'Regenerating…' : '↻ Regenerate'}
                                                        </button>
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Question</label>
                                                        <textarea
                                                            rows={2}
                                                            value={q.questionText || ''}
                                                            onChange={e => updateQuestion(idx, 'questionText', e.target.value)}
                                                        />
                                                    </div>
                                                    {q.questionType === 'multiple_choice' && (
                                                        <div className="options-list">
                                                            {(q.options || []).map((opt, oi) => (
                                                                <div key={oi} className="option-row">
                                                                    <span className="option-label">{opt.label}.</span>
                                                                    <input
                                                                        type="text"
                                                                        value={opt.text || ''}
                                                                        onChange={e => {
                                                                            const newOptions = [...(q.options || [])];
                                                                            newOptions[oi] = { ...newOptions[oi], text: e.target.value };
                                                                            updateQuestion(idx, 'options', newOptions);
                                                                        }}
                                                                    />
                                                                    <label className="correct-radio">
                                                                        <input
                                                                            type="radio"
                                                                            name={`correct-${idx}`}
                                                                            checked={q.correctAnswer === opt.label}
                                                                            onChange={() => updateQuestion(idx, 'correctAnswer', opt.label)}
                                                                        />
                                                                        Correct
                                                                    </label>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {q.questionType === 'true_false' && (
                                                        <div className="true-false-row">
                                                            <label>
                                                                <input type="radio" name={`tf-${idx}`} checked={q.correctAnswer === 'True'} onChange={() => updateQuestion(idx, 'correctAnswer', 'True')} />
                                                                True
                                                            </label>
                                                            <label>
                                                                <input type="radio" name={`tf-${idx}`} checked={q.correctAnswer === 'False'} onChange={() => updateQuestion(idx, 'correctAnswer', 'False')} />
                                                                False
                                                            </label>
                                                        </div>
                                                    )}
                                                    <div className="form-group">
                                                        <label>Explanation</label>
                                                        <input
                                                            type="text"
                                                            value={q.explanation || ''}
                                                            onChange={e => updateQuestion(idx, 'explanation', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                            {!poolLoading && !poolError && (
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-ghost" onClick={closePool}>Close</button>
                                    <button type="button" className="btn btn-primary" onClick={handleSavePool} disabled={savingPool}>
                                        {savingPool ? 'Saving…' : 'Save Pool'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-success"
                                        onClick={() => { closePool(); if (poolTestId) handlePublish(poolTestId); }}
                                    >
                                        Save &amp; Publish
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </FeatureGate>
    );
};

export default GrammarTestPage;
