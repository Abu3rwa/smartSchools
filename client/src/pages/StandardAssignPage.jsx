import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
    fetchStandards, fetchAssignments, createAssignment, updateAssignment, deleteAssignment, fetchAssignmentProgress,
    selectStandards, selectAssignments, selectAssignmentProgress, selectAssignmentProgressLoading, selectStandardsLoading, selectStandardsError,
    clearAssignmentProgress
} from '../store/slices/standardSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import { selectUser } from '../store/slices/authSlice';
import { selectCurrentAcademicYear, selectSelectedSemester } from '../store/slices/uiSlice';
import api from '../config/api';
import {
    HiOutlinePlus, HiOutlineTrash, HiOutlineEye, HiOutlinePencilAlt,
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
    const selectedSemester = useSelector(selectSelectedSemester);

    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [progressAssignmentId, setProgressAssignmentId] = useState(null);
    const [showAssessmentGradebookModal, setShowAssessmentGradebookModal] = useState(false);
    const [assessmentGradebookAssignmentId, setAssessmentGradebookAssignmentId] = useState(null);
    const [assessmentGradebookLoading, setAssessmentGradebookLoading] = useState(false);
    const [assessmentGradebookError, setAssessmentGradebookError] = useState('');
    const [assessmentGradebookData, setAssessmentGradebookData] = useState(null);
    const [releasingAssessmentResults, setReleasingAssessmentResults] = useState(false);
    const [classes, setClasses] = useState([]);
    const [students, setStudents] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [editingAssignmentId, setEditingAssignmentId] = useState(null);

    const buildInitialFormData = (semester = 1) => ({
        title: '',
        standardId: '',
        classId: '',
        subjectId: '',
        semester: semester || 1,
        students: [],
        dueDate: '',
        instructions: '',
        practiceConfig: {
            sessionType: 'practice',
            questionLimit: '',
            timeLimitSeconds: '', // store as minutes in UI, convert on submit
            allowedQuestionTypes: ['multiple_choice', 'short_answer', 'true_false'],
            allowedDifficulties: ['easy', 'medium', 'hard'],
            availability: {
                startAt: '',
                endAt: ''
            },
            lockStudentOptions: false
        },
        assessmentConfig: {
            maxMarks: '100',
            passMarks: '40',
            resultsVisibility: 'immediate',
            resultsReleaseAt: ''
        }
    });
    const [formData, setFormData] = useState(buildInitialFormData(selectedSemester));

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
        if (selectedClass?.grade && Number(s.gradeLevel) !== Number(selectedClass.grade)) return false;
        const subjId = getEntityId(s.subject);
        if (formData.subjectId && subjId !== getEntityId(formData.subjectId)) return false;
        return true;
    });
    const selectedStandard = standards.find((s) => getEntityId(s._id) === getEntityId(formData.standardId));

    const getStandardDescription = (standard) => {
        const description = (standard?.description || '').trim();
        if (description) return description;
        const fallbackName = (standard?.name || '').trim();
        if (fallbackName) return fallbackName;
        return 'No description available for this standard yet.';
    };

    const getStandardOptionLabel = (standard) => {
        const base = `${standard?.code || 'STD'} - ${standard?.name || 'Standard'} (Grade ${standard?.gradeLevel || '-'})`;
        const description = getStandardDescription(standard);
        const shortDescription =
            description.length > 90 ? `${description.substring(0, 90)}...` : description;
        return `${base} | ${shortDescription}`;
    };

    useEffect(() => {
        dispatch(fetchStandards({ limit: 2000, isActive: true }));
        dispatch(fetchAssignments({ academicYear, semester: selectedSemester }));
        dispatch(fetchSubjects());
        loadClasses();
    }, [dispatch, academicYear, selectedSemester]);

    useEffect(() => {
        if (editingAssignmentId) return;
        setFormData((prev) => ({
            ...prev,
            semester: selectedSemester || prev.semester || 1,
        }));
    }, [selectedSemester, editingAssignmentId]);

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

    const parseNullablePositiveInt = (value) => {
        const parsed = parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return parsed;
    };

    const toDateInput = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toISOString().slice(0, 10);
    };

    const toDateTimeLocalInput = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
    };

    const resetAssignModalState = () => {
        setEditingAssignmentId(null);
        setFormData(buildInitialFormData(selectedSemester));
        setShowAdvanced(false);
        setStudents([]);
    };

    const openCreateModal = () => {
        resetAssignModalState();
        setShowAssignModal(true);
    };

    const handleEdit = async (assignment) => {
        const nextForm = {
            title: assignment?.title || '',
            standardId: assignment?.standard?._id || assignment?.standard || '',
            classId: assignment?.class?._id || assignment?.class || '',
            subjectId: assignment?.subject?._id || assignment?.subject || '',
            semester: assignment?.semester || selectedSemester || 1,
            students: Array.isArray(assignment?.students)
                ? assignment.students.map((s) => s?._id || s).filter(Boolean)
                : [],
            dueDate: toDateInput(assignment?.dueDate),
            instructions: assignment?.instructions || '',
            practiceConfig: {
                sessionType: assignment?.practiceConfig?.sessionType || 'practice',
                questionLimit: assignment?.practiceConfig?.questionLimit || '',
                timeLimitSeconds: assignment?.practiceConfig?.timeLimitSeconds
                    ? Math.round(Number(assignment.practiceConfig.timeLimitSeconds) / 60)
                    : '',
                allowedQuestionTypes: assignment?.practiceConfig?.allowedQuestionTypes?.length
                    ? assignment.practiceConfig.allowedQuestionTypes
                    : ['multiple_choice', 'short_answer', 'true_false'],
                allowedDifficulties: assignment?.practiceConfig?.allowedDifficulties?.length
                    ? assignment.practiceConfig.allowedDifficulties
                    : ['easy', 'medium', 'hard'],
                availability: {
                    startAt: toDateTimeLocalInput(assignment?.practiceConfig?.availability?.startAt),
                    endAt: toDateTimeLocalInput(assignment?.practiceConfig?.availability?.endAt),
                },
                lockStudentOptions: Boolean(assignment?.practiceConfig?.lockStudentOptions),
            },
            assessmentConfig: {
                maxMarks: String(assignment?.assessmentConfig?.maxMarks || 100),
                passMarks: String(assignment?.assessmentConfig?.passMarks || 40),
                resultsVisibility: assignment?.assessmentConfig?.resultsVisibility || 'immediate',
                resultsReleaseAt: toDateTimeLocalInput(assignment?.assessmentConfig?.resultsReleaseAt),
            },
        };
        setEditingAssignmentId(assignment?._id || null);
        setFormData(nextForm);
        if (nextForm.classId) {
            await loadStudents(nextForm.classId);
        }
        setShowAdvanced(true);
        setShowAssignModal(true);
    };

    const handleAssign = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const title = (formData.title || '').trim();

        if (!formData.subjectId) {
            toast.error('Select a subject before assigning.');
            setSubmitting(false);
            return;
        }

        if (!title) {
            toast.error('Assignment name is required.');
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

        const startAtRaw = formData.practiceConfig.availability?.startAt || '';
        const endAtRaw = formData.practiceConfig.availability?.endAt || '';
        const startAt = startAtRaw ? new Date(startAtRaw) : null;
        const endAt = endAtRaw ? new Date(endAtRaw) : null;
        if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
            toast.error('End time must be after start time.');
            setSubmitting(false);
            return;
        }

        const maxMarks = parseNullablePositiveInt(formData.assessmentConfig.maxMarks) || 100;
        const passMarks = parseNullablePositiveInt(formData.assessmentConfig.passMarks) || 40;
        if (passMarks > maxMarks) {
            toast.error('Pass marks cannot be greater than max marks.');
            setSubmitting(false);
            return;
        }

        const payload = {
            ...formData,
            title,
            semester: parseNullablePositiveInt(formData.semester) || (selectedSemester || 1),
            practiceConfig: {
                ...formData.practiceConfig,
                questionLimit: parseNullablePositiveInt(formData.practiceConfig.questionLimit),
                timeLimitSeconds: (parseNullablePositiveInt(formData.practiceConfig.timeLimitSeconds) || 0) * 60 || null,
                availability: {
                    startAt: startAt ? startAt.toISOString() : null,
                    endAt: endAt ? endAt.toISOString() : null
                }
            },
            assessmentConfig: {
                maxMarks,
                passMarks,
                resultsVisibility: formData.assessmentConfig.resultsVisibility || 'immediate',
                resultsReleaseAt: formData.assessmentConfig.resultsReleaseAt
                    ? new Date(formData.assessmentConfig.resultsReleaseAt).toISOString()
                    : null
            }
        };

        try {
            const action = editingAssignmentId
                ? updateAssignment({ id: editingAssignmentId, data: payload })
                : createAssignment(payload);
            const result = await dispatch(action);
            const success = editingAssignmentId
                ? updateAssignment.fulfilled.match(result)
                : createAssignment.fulfilled.match(result);
            if (success) {
                toast.success(editingAssignmentId ? 'Assignment updated successfully!' : 'Standard assigned successfully!');
                setShowAssignModal(false);
                resetAssignModalState();
                dispatch(fetchAssignments({ academicYear, semester: selectedSemester }));
            } else {
                toast.error(result.payload || (editingAssignmentId ? 'Failed to update assignment' : 'Failed to assign'));
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

    const loadAssessmentGradebook = async (assignmentId) => {
        setAssessmentGradebookLoading(true);
        setAssessmentGradebookError('');
        setAssessmentGradebookData(null);
        try {
            const response = await api.get(`/practice/assessment/${assignmentId}/gradebook`);
            setAssessmentGradebookData(response.data.data || null);
        } catch (err) {
            setAssessmentGradebookError(err?.response?.data?.message || 'Unable to load SB gradebook.');
        } finally {
            setAssessmentGradebookLoading(false);
        }
    };

    const handleViewAssessmentGradebook = async (assignmentId) => {
        setAssessmentGradebookAssignmentId(assignmentId);
        setShowAssessmentGradebookModal(true);
        await loadAssessmentGradebook(assignmentId);
    };

    const handleReleaseAssessmentResults = async () => {
        if (!assessmentGradebookAssignmentId) return;
        setReleasingAssessmentResults(true);
        try {
            const response = await api.post(`/practice/assessment/${assessmentGradebookAssignmentId}/release`);
            toast.success(response?.data?.message || 'Assessment results released');
            await loadAssessmentGradebook(assessmentGradebookAssignmentId);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to release assessment results');
        } finally {
            setReleasingAssessmentResults(false);
        }
    };

    const getMasteryColor = (pct) => {
        if (pct >= 80) return 'green';
        if (pct >= 40) return 'yellow';
        return 'red';
    };

    const getProgressStatusDisplay = (status) => {
        const normalized = (status || '').toLowerCase();
        if (normalized === 'mastered') return { label: 'Mastered', className: 'mastered' };
        if (normalized === 'needs_review') return { label: 'Needs Review', className: 'needs-review' };
        if (normalized === 'in_progress') return { label: 'In Progress', className: 'in-progress' };
        return { label: 'Not Started', className: 'not-started' };
    };

    return (
        <div className="assign-page">
            <div className="page-header">
                <div>
                    <h1>Assign Standards</h1>
                    <p className="text-muted">Assign standards to classes and track student mastery</p>
                </div>
                <button className="btn btn-primary" onClick={openCreateModal}>
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
                                    <span className="text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>{a.title || `${a.standard?.code} Assignment`}</span>
                                    <span className="standard-code">{a.standard?.code}</span>
                                    <h4>{a.standard?.name}</h4>
                                </div>
                            </div>
                            <div className="assign-card-body">
                                {getStandardDescription(a.standard).substring(0, 100)}
                                {getStandardDescription(a.standard).length > 100 ? '...' : ''}
                            </div>
                            <div className="assign-card-meta">
                                <span><HiOutlineBookOpen size={14} /> {a.subject?.name}</span>
                                <span><HiOutlineAcademicCap size={14} /> {a.class?.name || 'Class'}</span>
                                <span><HiOutlineUserGroup size={14} /> {a.students?.length || 'All'} students</span>
                                <span>
                                    <HiOutlineBookOpen size={14} /> Mode: {a.practiceConfig?.sessionType === 'assessment' ? 'Graded Assessment' : 'Practice'}
                                </span>
                                <span><HiOutlineCalendar size={14} /> AY: {a.academicYear || academicYear}</span>
                                <span><HiOutlineCalendar size={14} /> Semester: {a.semester || selectedSemester || 1}</span>
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
                                {(isAdmin || a.teacher?.user?._id === user?._id || a.teacher?.user === user?._id) && (
                                    <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(a)}>
                                        <HiOutlinePencilAlt size={16} /> Edit
                                    </button>
                                )}
                                {(a.practiceConfig?.sessionType === 'assessment') && (
                                    <button className="btn btn-secondary btn-sm" onClick={() => handleViewAssessmentGradebook(a._id)}>
                                        <HiOutlineEye size={16} /> SB Gradebook
                                    </button>
                                )}
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
                <div className="modal-overlay" onClick={() => { setShowAssignModal(false); resetAssignModalState(); }}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingAssignmentId ? 'Edit Assignment' : 'Assign Standard'}</h3>
                            <button className="modal-close" onClick={() => { setShowAssignModal(false); resetAssignModalState(); }}>&times;</button>
                        </div>
                        <form onSubmit={handleAssign}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Assignment Name *</label>
                                    <input
                                        type="text"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="e.g. Fractions Unit Test - Term 1"
                                        required
                                    />
                                    <small className="text-muted">
                                        This name appears in Standards-Based (SB) gradebook and reports.
                                    </small>
                                </div>
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
                                                {getStandardOptionLabel(s)}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedClass && (
                                        <small className="text-muted">
                                            Showing standards for Grade {selectedClass.grade}
                                            {formData.subjectId ? ' and selected subject' : ''}.
                                        </small>
                                    )}
                                    {formData.standardId && (
                                        <small className="text-muted" style={{ display: 'block', marginTop: 8 }}>
                                            {getStandardDescription(selectedStandard)}
                                        </small>
                                    )}
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Assignment Mode *</label>
                                        <select
                                            value={formData.practiceConfig.sessionType === 'assessment' ? 'assessment' : 'practice'}
                                            onChange={(e) => {
                                                const nextMode = e.target.value === 'assessment' ? 'assessment' : 'practice';
                                                setFormData({
                                                    ...formData,
                                                    practiceConfig: { ...formData.practiceConfig, sessionType: nextMode }
                                                });
                                            }}
                                            required
                                        >
                                            <option value="practice">Practice (Not Graded)</option>
                                            <option value="assessment">Graded Assessment (SB)</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Semester *</label>
                                        <select
                                            value={formData.semester || selectedSemester || 1}
                                            onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                                            required
                                        >
                                            <option value={1}>Semester 1</option>
                                            <option value={2}>Semester 2</option>
                                        </select>
                                    </div>
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
                                                <label>Assignment Mode</label>
                                                <select
                                                    value={formData.practiceConfig.sessionType}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        practiceConfig: { ...formData.practiceConfig, sessionType: e.target.value }
                                                    })}
                                                >
                                                    <option value="practice">Practice (Not Graded)</option>
                                                    <option value="assessment">Graded Assessment (SB)</option>
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

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Start Time (optional)</label>
                                                <input
                                                    type="datetime-local"
                                                    value={formData.practiceConfig.availability.startAt}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        practiceConfig: {
                                                            ...formData.practiceConfig,
                                                            availability: {
                                                                ...formData.practiceConfig.availability,
                                                                startAt: e.target.value
                                                            }
                                                        }
                                                    })}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>End Time (optional)</label>
                                                <input
                                                    type="datetime-local"
                                                    value={formData.practiceConfig.availability.endAt}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        practiceConfig: {
                                                            ...formData.practiceConfig,
                                                            availability: {
                                                                ...formData.practiceConfig.availability,
                                                                endAt: e.target.value
                                                            }
                                                        }
                                                    })}
                                                />
                                            </div>
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

                                        {formData.practiceConfig.sessionType === 'assessment' && (
                                            <>
                                                <hr style={{ margin: '15px 0' }} />
                                                <div className="form-group">
                                                    <label style={{ fontWeight: 700 }}>Official Assessment Settings (SB Gradebook)</label>
                                                    <small className="text-muted" style={{ display: 'block' }}>
                                                        This writes to a separate Standards-Based gradebook, not the regular gradebook.
                                                    </small>
                                                </div>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>Max Marks</label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={formData.assessmentConfig.maxMarks}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                assessmentConfig: { ...formData.assessmentConfig, maxMarks: e.target.value }
                                                            })}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Pass Marks</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={formData.assessmentConfig.passMarks}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                assessmentConfig: { ...formData.assessmentConfig, passMarks: e.target.value }
                                                            })}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>Results Visibility</label>
                                                        <select
                                                            value={formData.assessmentConfig.resultsVisibility}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                assessmentConfig: { ...formData.assessmentConfig, resultsVisibility: e.target.value }
                                                            })}
                                                        >
                                                            <option value="immediate">Immediate</option>
                                                            <option value="manual_release">Manual release</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Results Release At (optional)</label>
                                                        <input
                                                            type="datetime-local"
                                                            value={formData.assessmentConfig.resultsReleaseAt}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                assessmentConfig: { ...formData.assessmentConfig, resultsReleaseAt: e.target.value }
                                                            })}
                                                            disabled={formData.assessmentConfig.resultsVisibility !== 'manual_release'}
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}
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
                                <button type="button" className="btn btn-secondary" onClick={() => { setShowAssignModal(false); resetAssignModalState(); }}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting
                                        ? (editingAssignmentId ? 'Saving...' : 'Assigning...')
                                        : (editingAssignmentId ? 'Save Changes' : 'Assign Standard')}
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
                                        <span style={{ color: 'var(--error-600, #b91c1c)' }}>Needs Review: <strong>{assignmentProgress.summary?.needsReview || 0}</strong></span>
                                        <span>Not Started: <strong>{assignmentProgress.summary?.notStarted}</strong></span>
                                    </div>
                                    <div className="progress-list">
                                        {assignmentProgress.studentsProgress?.map(sp => {
                                            const status = getProgressStatusDisplay(sp.progressStatus);
                                            return (
                                            <div key={sp.student._id} className="progress-row">
                                                <span className="progress-student-name">
                                                    {sp.student.firstName} {sp.student.lastName}
                                                </span>
                                                <div className="progress-stats">
                                                    <span className={`mastery-badge ${status.className}`}>{status.label}</span>
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
                                        )})}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showAssessmentGradebookModal && (
                <div
                    className="modal-overlay"
                    onClick={() => {
                        setShowAssessmentGradebookModal(false);
                        setAssessmentGradebookAssignmentId(null);
                        setAssessmentGradebookData(null);
                        setAssessmentGradebookError('');
                    }}
                >
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
                        <div className="modal-header">
                            <h3>SB Gradebook (Standards-Based)</h3>
                            <button
                                className="modal-close"
                                onClick={() => {
                                    setShowAssessmentGradebookModal(false);
                                    setAssessmentGradebookAssignmentId(null);
                                    setAssessmentGradebookData(null);
                                    setAssessmentGradebookError('');
                                }}
                            >
                                &times;
                            </button>
                        </div>
                        <div className="modal-body">
                            {assessmentGradebookLoading ? (
                                <div className="loading-container"><div className="spinner"></div></div>
                            ) : assessmentGradebookError ? (
                                <div className="assign-empty" style={{ padding: 'var(--spacing-lg) 0' }}>
                                    <p>{assessmentGradebookError}</p>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => assessmentGradebookAssignmentId && loadAssessmentGradebook(assessmentGradebookAssignmentId)}
                                        disabled={!assessmentGradebookAssignmentId}
                                    >
                                        Retry
                                    </button>
                                </div>
                            ) : !assessmentGradebookData ? (
                                <div className="assign-empty" style={{ padding: 'var(--spacing-lg) 0' }}>
                                    <p>No SB gradebook data found.</p>
                                </div>
                            ) : (
                                <>
                                    <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                        <strong>{assessmentGradebookData.assignment?.title || assessmentGradebookData.assignment?.standard?.name}</strong>
                                        <span style={{ marginLeft: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            ({assessmentGradebookData.assignment?.standard?.code || 'Assessment'})
                                        </span>
                                        <p className="text-muted" style={{ marginTop: 6 }}>
                                            Separate SB gradebook. This does not use the regular gradebook module.
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                                        <span>Total: <strong>{assessmentGradebookData.summary?.totalStudents || 0}</strong></span>
                                        <span>Released: <strong>{assessmentGradebookData.summary?.released || 0}</strong></span>
                                        <span>Submitted: <strong>{assessmentGradebookData.summary?.submitted || 0}</strong></span>
                                        <span>In Progress: <strong>{assessmentGradebookData.summary?.inProgress || 0}</strong></span>
                                        <span>Not Started: <strong>{assessmentGradebookData.summary?.notStarted || 0}</strong></span>
                                        <span>Avg %: <strong>{assessmentGradebookData.summary?.averagePercentage || 0}</strong></span>
                                        <span>Avg 0-4: <strong>{assessmentGradebookData.summary?.averageScale4 || 0}</strong></span>
                                    </div>

                                    <div className="table-container" style={{ maxHeight: 420, overflow: 'auto' }}>
                                        <table className="practice-table">
                                            <thead>
                                                <tr>
                                                    <th>Student</th>
                                                    <th>Status</th>
                                                    <th>Answered</th>
                                                    <th>Score</th>
                                                    <th>%</th>
                                                    <th>0-4</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(assessmentGradebookData.rows || []).map((row) => (
                                                    <tr key={row.student?._id || row.student?.studentId}>
                                                        <td>{row.student?.firstName} {row.student?.lastName}</td>
                                                        <td>{(row.status || 'not_started').replace('_', ' ')}</td>
                                                        <td>{row.totalAnswered ?? 0}</td>
                                                        <td>{row.score !== null && row.score !== undefined ? `${row.score}/${row.maxScore || 100}` : '—'}</td>
                                                        <td>{row.percentage !== null && row.percentage !== undefined ? `${row.percentage}%` : '—'}</td>
                                                        <td>{row.scale4 !== null && row.scale4 !== undefined ? row.scale4 : '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => assessmentGradebookAssignmentId && loadAssessmentGradebook(assessmentGradebookAssignmentId)}
                                disabled={!assessmentGradebookAssignmentId || assessmentGradebookLoading}
                            >
                                Refresh
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleReleaseAssessmentResults}
                                disabled={!assessmentGradebookAssignmentId || releasingAssessmentResults || assessmentGradebookLoading}
                            >
                                {releasingAssessmentResults ? 'Releasing...' : 'Release Results'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StandardAssignPage;
