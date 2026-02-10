import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
    fetchStandards, fetchAssignments, createAssignment, deleteAssignment, fetchAssignmentProgress,
    selectStandards, selectAssignments, selectAssignmentProgress, selectStandardsLoading,
    clearAssignmentProgress
} from '../store/slices/standardSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import { selectUser } from '../store/slices/authSlice';
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
    const loading = useSelector(selectStandardsLoading);
    const subjects = useSelector(selectSubjects);
    const user = useSelector(selectUser);

    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [classes, setClasses] = useState([]);
    const [students, setStudents] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        standardId: '',
        classId: '',
        subjectId: '',
        students: [],
        dueDate: '',
        instructions: ''
    });

    useEffect(() => {
        dispatch(fetchStandards());
        dispatch(fetchAssignments());
        dispatch(fetchSubjects());
        loadClasses();
    }, [dispatch]);

    const loadClasses = async () => {
        try {
            const response = await api.get('/classes');
            setClasses(response.data.data?.classes || []);
        } catch (err) {
            console.error('Failed to load classes', err);
        }
    };

    const loadStudents = async (classId) => {
        if (!classId) { setStudents([]); return; }
        try {
            const response = await api.get(`/students?classId=${classId}`);
            setStudents(response.data.data?.students || []);
        } catch (err) {
            console.error('Failed to load students', err);
        }
    };

    const handleClassChange = (classId) => {
        setFormData({ ...formData, classId, students: [] });
        loadStudents(classId);
    };

    const handleAssign = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const result = await dispatch(createAssignment(formData));
            if (createAssignment.fulfilled.match(result)) {
                toast.success('Standard assigned successfully!');
                setShowAssignModal(false);
                setFormData({ standardId: '', classId: '', subjectId: '', students: [], dueDate: '', instructions: '' });
                dispatch(fetchAssignments());
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
                            </div>
                            <div className="assign-card-footer">
                                <button className="btn btn-secondary btn-sm" onClick={() => handleViewProgress(a._id)}>
                                    <HiOutlineEye size={16} /> View Progress
                                </button>
                                <button className="btn-icon text-danger" onClick={() => handleDelete(a._id)} title="Remove">
                                    <HiOutlineTrash />
                                </button>
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
                                        {standards.map(s => (
                                            <option key={s._id} value={s._id}>
                                                {s.code} - {s.name} (Grade {s.gradeLevel})
                                            </option>
                                        ))}
                                    </select>
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
                                            onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Subject</option>
                                            {subjects.map(s => (
                                                <option key={s._id} value={s._id}>{s.name}</option>
                                            ))}
                                        </select>
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
                <div className="modal-overlay" onClick={() => { setShowProgressModal(false); dispatch(clearAssignmentProgress()); }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                        <div className="modal-header">
                            <h3>Student Progress</h3>
                            <button className="modal-close" onClick={() => { setShowProgressModal(false); dispatch(clearAssignmentProgress()); }}>&times;</button>
                        </div>
                        <div className="modal-body">
                            {!assignmentProgress ? (
                                <div className="loading-container"><div className="spinner"></div></div>
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
