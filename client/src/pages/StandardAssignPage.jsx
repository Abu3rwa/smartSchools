import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
    fetchStandards, fetchAssignments, createAssignment, deleteAssignment, fetchAssignmentProgress,
    selectStandards, selectAssignments, selectAssignmentProgress, selectAssignmentProgressLoading, selectStandardsLoading, selectStandardsError,
    clearAssignmentProgress
} from '../store/slices/standardSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import { selectUser } from '../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import api from '../config/api';
import {
    HiOutlinePlus, HiOutlineTrash, HiOutlineEye,
    HiOutlineAcademicCap, HiOutlineUserGroup, HiOutlineBookOpen, HiOutlineCalendar
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import './StandardAssignPage.css';

const StandardAssignPage = () => {
    const dispatch = useDispatch();
    const standards = useSelector(selectStandards);
    const assignments = useSelector(selectAssignments);
    const assignmentProgress = useSelector(selectAssignmentProgress);
    const assignmentProgressLoading = useSelector(selectAssignmentProgressLoading);
    const loading = useSelector(selectStandardsLoading);
    const standardsError = useSelector(selectStandardsError);
    const subjects = useSelector(selectSubjects);
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [progressAssignmentId, setProgressAssignmentId] = useState(null);
    const [classes, setClasses] = useState([]);
    const [students, setStudents] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        standardId: '',
        classId: '',
        subjectId: '',
        students: [],
        dueDate: '',
        instructions: '',
        practiceConfig: {
            sessionType: 'practice',
            questionLimit: '',
            timeLimitSeconds: '', // store as minutes in UI, convert on submit
            allowedQuestionTypes: ['multiple_choice', 'short_answer', 'true_false'],
            allowedDifficulties: ['easy', 'medium', 'hard'],
            lockStudentOptions: false
        }
    });

    const [showAdvanced, setShowAdvanced] = useState(false);

    const isAdmin = user?.role === 'admin';
    const isTeacher = user?.role === 'teacher';

    const getEntityId = (entity) => (entity?._id || entity || '').toString();
    const getTeacherUserId = (subjectEntry) =>
        (subjectEntry?.teacher?.user?._id || subjectEntry?.teacher?.user || subjectEntry?.teacher || '').toString();

    const getScopedClassSubjects = (schoolClass) => {
        const classSubjectsRaw = Array.isArray(schoolClass?.subjects) ? schoolClass.subjects : [];
        const scopedEntries = classSubjectsRaw.filter((entry) => {
            if (!entry?.subject) return false;
            if (!isTeacher) return true;
            return getTeacherUserId(entry) === getEntityId(user?._id);
        });

        const seen = new Set();
        return scopedEntries
            .map((entry) => entry.subject)
            .filter((subject) => {
                const subjectId = getEntityId(subject);
                if (!subjectId || seen.has(subjectId)) return false;
                seen.add(subjectId);
                return true;
            });
    };

    const selectedClass = classes.find(c => c._id === formData.classId);
    const classSubjects = getScopedClassSubjects(selectedClass);
    const subjectOptions = selectedClass
        ? (classSubjects.length > 0 ? classSubjects : (isTeacher ? [] : subjects))
        : (isTeacher ? [] : subjects);

    const availableStandards = standards.filter(s => {
        if (selectedClass?.grade && s.gradeLevel !== selectedClass.grade) return false;
        const subjId = getEntityId(s.subject);
        if (formData.subjectId && subjId !== getEntityId(formData.subjectId)) return false;
        return true;
    });

    useEffect(() => {
        dispatch(fetchStandards());
        dispatch(fetchAssignments({ academicYear }));
        dispatch(fetchSubjects());
        loadClasses();
    }, [dispatch, academicYear]);

    const loadClasses = async () => {
        try {
            const response = await api.get('/classes', { params: { academicYear } });
            setClasses(response.data.data?.classes || []);
        } catch (err) {
            console.error('Failed to load classes', err);
        }
    };

    const loadStudents = async (classId) => {
        if (!classId) { setStudents([]); return; }
        try {
            const response = await api.get('/students', { params: { classId, academicYear } });
            setStudents(response.data.data?.students || []);
        } catch (err) {
            console.error('Failed to load students', err);
        }
    };

    const handleClassChange = (classId) => {
        const cls = classes.find(c => c._id === classId);
        const clsSubjects = getScopedClassSubjects(cls);
        const autoSubjectId = clsSubjects.length === 1 ? getEntityId(clsSubjects[0]) : '';

        setFormData({
            ...formData,
            classId,
            students: [],
            subjectId: autoSubjectId,
            standardId: ''
        });
        loadStudents(classId);
    };

    const handleAssign = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        if (!formData.subjectId) {
            toast.error('Select a subject before assigning.');
            setSubmitting(false);
            return;
        }

        if (isTeacher && formData.classId && subjectOptions.length === 0) {
            toast.error('No subject mapping found for this class. Contact admin to update class subjects.');
            setSubmitting(false);
            return;
        }

        const isSubjectAllowed = subjectOptions.some((subject) => getEntityId(subject) === getEntityId(formData.subjectId));
        if (!isSubjectAllowed) {
            toast.error('Selected subject is not available for this class.');
            setSubmitting(false);
            return;
        }

        const payload = {
            ...formData,
            practiceConfig: {
                ...formData.practiceConfig,
                questionLimit: formData.practiceConfig.questionLimit ? parseInt(formData.practiceConfig.questionLimit) : null,
                timeLimitSeconds: formData.practiceConfig.timeLimitSeconds ? parseInt(formData.practiceConfig.timeLimitSeconds) * 60 : null
            }
        };

        try {
            const result = await dispatch(createAssignment(payload));
            if (createAssignment.fulfilled.match(result)) {
                toast.success('Standard assigned successfully!');
                setShowAssignModal(false);
                setFormData({
                    standardId: '',
                    classId: '',
                    subjectId: '',
                    students: [],
                    dueDate: '',
                    instructions: '',
                    practiceConfig: {
                        sessionType: 'practice',
                        questionLimit: '',
                        timeLimitSeconds: '',
                        allowedQuestionTypes: ['multiple_choice', 'short_answer', 'true_false'],
                        allowedDifficulties: ['easy', 'medium', 'hard'],
                        lockStudentOptions: false
                    }
                });
                setShowAdvanced(false);
                dispatch(fetchAssignments({ academicYear }));
            } else {
                toast.error(result.payload || 'Failed to assign');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Remove this assignment?')) {
            const result = await dispatch(deleteAssignment(id));
            if (deleteAssignment.fulfilled.match(result)) {
                toast.success('Assignment removed');
            } else {
                toast.error(result.payload || 'Failed to remove');
            }
        }
    };

    const handleViewProgress = async (assignmentId) => {
        setProgressAssignmentId(assignmentId);
        dispatch(fetchAssignmentProgress(assignmentId));
        setShowProgressModal(true);
    };

    const getMasteryColor = (pct) => {
        if (pct >= 80) return 'green';
        if (pct >= 40) return 'yellow';
        return 'red';
    };

    return (
        <div className="assign-page">
            <div className="page-header">
                <div>
                    <h1>Assign Standards</h1>
                    <p className="text-muted">Assign standards to classes and track student mastery</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAssignModal(true)}>
                    <HiOutlinePlus size={20} />
                    New Assignment
                </button>
            </div>

            {loading && !assignments.length ? (
                <div className="loading-container"><div className="spinner"></div></div>
            ) : assignments.length === 0 ? (
                <div className="assign-empty">
                    <HiOutlineAcademicCap size={48} />
                    <p>No standard assignments yet</p>
                    <p style={{ fontSize: '0.85rem' }}>Click "New Assignment" to assign a standard to your class.</p>
                </div>
            ) : (
                <div className="assign-cards">
                    {assignments.map(a => (
                        <div key={a._id} className="assign-card">
                            <div className="assign-card-header">
                                <div>
                                    <span className="standard-code">{a.standard?.code}</span>
                                    <h4>{a.standard?.name}</h4>
                                </div>
                            </div>
                            <div className="assign-card-body">
                                {a.standard?.description?.substring(0, 100)}
                                {a.standard?.description?.length > 100 ? '...' : ''}
                            </div>
                            <div className="assign-card-meta">
                                <span><HiOutlineBookOpen size={14} /> {a.subject?.name}</span>
                                <span><HiOutlineAcademicCap size={14} /> {a.class?.name || 'Class'}</span>
                                <span><HiOutlineUserGroup size={14} /> {a.students?.length || 'All'} students</span>
                                {a.dueDate && (
                                    <span><HiOutlineCalendar size={14} /> Due: {new Date(a.dueDate).toLocaleDateString()}</span>
                                )}
                                {isTeacher && a.teacher?.user?._id !== user?._id && a.teacher?.user !== user?._id && (
                                    <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Admin assigned</span>
                                )}
                            </div>
                            <div className="assign-card-footer">
                                <button className="btn btn-secondary btn-sm" onClick={() => handleViewProgress(a._id)}>
                                    <HiOutlineEye size={16} /> View Progress
                                </button>
                                {/* Teachers can only delete their own assignments; admins can delete any */}
                                {(isAdmin || a.teacher?.user?._id === user?._id || a.teacher?.user === user?._id) && (
                                    <button className="btn-icon text-danger" onClick={() => handleDelete(a._id)} title="Remove">
                                        <HiOutlineTrash />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Assign Modal */}
            {showAssignModal && (
                <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Assign Standard</h3>
                            <button className="modal-close" onClick={() => setShowAssignModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleAssign}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Standard *</label>
                                    <select
                                        value={formData.standardId}
                                        onChange={(e) => setFormData({ ...formData, standardId: e.target.value })}
                                        required
                                    >
                                        <option value="">Select Standard</option>
                                        {availableStandards.map(s => (
                                            <option key={s._id} value={s._id}>
                                                {s.code} - {s.name} (Grade {s.gradeLevel})
                                            </option>
                                        ))}
                                    </select>
                                    {selectedClass && (
                                        <small className="text-muted">
                                            Showing standards for Grade {selectedClass.grade}
                                            {formData.subjectId ? ' and selected subject' : ''}.
                                        </small>
                                    )}
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Class *</label>
                                        <select
                                            value={formData.classId}
                                            onChange={(e) => handleClassChange(e.target.value)}
                                            required
                                        >
                                            <option value="">Select Class</option>
                                            {classes.map(c => (
                                                <option key={c._id} value={c._id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Subject *</label>
                                        <select
                                            value={formData.subjectId}
                                            onChange={(e) => setFormData({ ...formData, subjectId: e.target.value, standardId: '' })}
                                            disabled={!formData.classId || subjectOptions.length === 0}
                                            required
                                        >
                                            <option value="">Select Subject</option>
                                            {subjectOptions.map((subject) => {
                                                const subjectId = getEntityId(subject);
                                                const subjectName =
                                                    subject?.name ||
                                                    subjects.find((item) => getEntityId(item) === subjectId)?.name ||
                                                    'Subject';
                                                return (
                                                    <option key={subjectId} value={subjectId}>
                                                        {subjectName}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        {!selectedClass && isTeacher && (
                                            <small className="text-muted">
                                                Select a class to view your assigned subjects.
                                            </small>
                                        )}
                                        {selectedClass && classSubjects.length > 0 && (
                                            <small className="text-muted">
                                                {isTeacher
                                                    ? 'Showing only subjects you teach in this class.'
                                                    : 'Subjects limited to this class configuration.'}
                                            </small>
                                        )}
                                        {selectedClass && isTeacher && classSubjects.length === 0 && (
                                            <small className="text-danger">
                                                No subjects are mapped to you for this class yet.
                                            </small>
                                        )}
                                    </div>
                                </div>
                                {students.length > 0 && (
                                    <div className="form-group">
                                        <label>Specific Students (leave empty for whole class)</label>
                                        <select
                                            multiple
                                            value={formData.students}
                                            onChange={(e) => {
                                                const selected = Array.from(e.target.selectedOptions, o => o.value);
                                                setFormData({ ...formData, students: selected });
                                            }}
                                            style={{ minHeight: 100 }}
                                        >
                                            {students.map(s => (
                                                <option key={s._id} value={s._id}>
                                                    {s.firstName} {s.lastName} ({s.studentId})
                                                </option>
                                            ))}
                                        </select>
                                        <small className="text-muted">Hold Ctrl/Cmd to select multiple students</small>
                                    </div>
                                )}
                                <div className="form-group">
                                    <label>Due Date (optional)</label>
                                    <input
                                        type="date"
                                        value={formData.dueDate}
                                        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                                    />
                                </div>

                                <div className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)} style={{ cursor: 'pointer', color: 'var(--primary-600)', fontWeight: 600, margin: '15px 0', display: 'flex', alignItems: 'center' }}>
                                    <span style={{ marginRight: 5 }}>{showAdvanced ? '▼' : '▶'}</span>
                                    Advanced Settings (Practice Config)
                                </div>

                                {showAdvanced && (
                                    <div className="advanced-settings" style={{ background: 'var(--bg-secondary)', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Session Type</label>
                                                <select
                                                    value={formData.practiceConfig.sessionType}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        practiceConfig: { ...formData.practiceConfig, sessionType: e.target.value }
                                                    })}
                                                >
                                                    <option value="practice">Practice (Default)</option>
                                                    <option value="homework">Homework</option>
                                                    <option value="assessment">Assessment</option>
                                                    <option value="classwork">Classwork</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Questions Limit (0 = Unlimited)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    placeholder="e.g. 10"
                                                    value={formData.practiceConfig.questionLimit}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        practiceConfig: { ...formData.practiceConfig, questionLimit: e.target.value }
                                                    })}
                                                />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Time Limit (minutes, 0 = Unlimited)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="e.g. 30"
                                                value={formData.practiceConfig.timeLimitSeconds}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    practiceConfig: { ...formData.practiceConfig, timeLimitSeconds: e.target.value }
                                                })}
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Allowed Question Types</label>
                                            <div className="checkbox-group" style={{ display: 'flex', gap: '15px' }}>
                                                {['multiple_choice', 'short_answer', 'true_false'].map(type => (
                                                    <label key={type} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.practiceConfig.allowedQuestionTypes.includes(type)}
                                                            onChange={(e) => {
                                                                const current = formData.practiceConfig.allowedQuestionTypes;
                                                                let next;
                                                                if (e.target.checked) next = [...current, type];
                                                                else next = current.filter(t => t !== type);
                                                                setFormData({
                                                                    ...formData,
                                                                    practiceConfig: { ...formData.practiceConfig, allowedQuestionTypes: next }
                                                                });
                                                            }}
                                                            style={{ marginRight: 5 }}
                                                        />
                                                        {type.replace('_', ' ')}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Allowed Difficulties</label>
                                            <div className="checkbox-group" style={{ display: 'flex', gap: '15px' }}>
                                                {['easy', 'medium', 'hard'].map(diff => (
                                                    <label key={diff} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.practiceConfig.allowedDifficulties.includes(diff)}
                                                            onChange={(e) => {
                                                                const current = formData.practiceConfig.allowedDifficulties;
                                                                let next;
                                                                if (e.target.checked) next = [...current, diff];
                                                                else next = current.filter(t => t !== diff);
                                                                setFormData({
                                                                    ...formData,
                                                                    practiceConfig: { ...formData.practiceConfig, allowedDifficulties: next }
                                                                });
                                                            }}
                                                            style={{ marginRight: 5 }}
                                                        />
                                                        {diff}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.practiceConfig.lockStudentOptions}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        practiceConfig: { ...formData.practiceConfig, lockStudentOptions: e.target.checked }
                                                    })}
                                                    style={{ marginRight: 8 }}
                                                />
                                                Lock student options (Student cannot override strict difficulty/type)
                                            </label>
                                        </div>
                                    </div>
                                )}

                                <div className="form-group">
                                    <label>Instructions (optional)</label>
                                    <textarea
                                        value={formData.instructions}
                                        onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                                        rows={2}
                                        placeholder="Additional instructions for students..."
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Assigning...' : 'Assign Standard'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Progress Modal */}
            {showProgressModal && (
                <div className="modal-overlay" onClick={() => { setShowProgressModal(false); setProgressAssignmentId(null); dispatch(clearAssignmentProgress()); }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                        <div className="modal-header">
                            <h3>Student Progress</h3>
                            <button className="modal-close" onClick={() => { setShowProgressModal(false); setProgressAssignmentId(null); dispatch(clearAssignmentProgress()); }}>&times;</button>
                        </div>
                        <div className="modal-body">
                            {assignmentProgressLoading ? (
                                <div className="loading-container"><div className="spinner"></div></div>
                            ) : !assignmentProgress ? (
                                <div className="assign-empty" style={{ padding: 'var(--spacing-lg) 0' }}>
                                    <p>{standardsError || 'Unable to load progress for this assignment.'}</p>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => progressAssignmentId && dispatch(fetchAssignmentProgress(progressAssignmentId))}
                                        disabled={!progressAssignmentId}
                                    >
                                        Retry
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                        <strong>{assignmentProgress.assignment?.standard?.name}</strong>
                                        <span style={{ marginLeft: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            ({assignmentProgress.assignment?.standard?.code})
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)', fontSize: '0.85rem' }}>
                                        <span>Total: <strong>{assignmentProgress.summary?.totalStudents}</strong></span>
                                        <span style={{ color: 'var(--success-600, #059669)' }}>Mastered: <strong>{assignmentProgress.summary?.mastered}</strong></span>
                                        <span style={{ color: 'var(--warning-600, #d97706)' }}>In Progress: <strong>{assignmentProgress.summary?.inProgress}</strong></span>
                                        <span>Not Started: <strong>{assignmentProgress.summary?.notStarted}</strong></span>
                                    </div>
                                    <div className="progress-list">
                                        {assignmentProgress.studentsProgress?.map(sp => (
                                            <div key={sp.student._id} className="progress-row">
                                                <span className="progress-student-name">
                                                    {sp.student.firstName} {sp.student.lastName}
                                                </span>
                                                <div className="progress-stats">
                                                    <span>{sp.mastery.correctCount}/{sp.mastery.totalAttempts} correct</span>
                                                    <div className="progress-bar-mini">
                                                        <div
                                                            className={`fill ${getMasteryColor(sp.mastery.percentage)}`}
                                                            style={{ width: `${sp.mastery.percentage}%` }}
                                                        ></div>
                                                    </div>
                                                    <span>{sp.mastery.percentage}%</span>
                                                    {sp.mastery.isMastered && (
                                                        <span className="mastery-badge mastered">Mastered</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StandardAssignPage;
