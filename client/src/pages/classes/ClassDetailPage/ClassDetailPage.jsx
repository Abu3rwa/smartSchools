import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
    fetchClass,
    updateClass,
    selectCurrentClass,
    selectClassStudents,
    selectClassesLoading,
    addSubjectToClass,
    removeSubjectFromClass,
    fetchClassAnalytics,
    fetchClassInsights,
    selectClassAnalytics,
    selectClassInsights,
    selectClassAnalyticsLoading,
    selectClassInsightsLoading,
    clearClassAnalyticsData
} from '../../../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../../../store/slices/subjectSlice';
import { fetchTeachers, selectTeachers } from '../../../store/slices/teacherSlice';
import { fetchDepartments, selectDepartments } from '../../../store/slices/departmentSlice';
import { selectIsAdmin, selectCanEditClass } from '../../../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { HiOutlineArrowLeft, HiOutlineUserGroup, HiOutlineBookOpen, HiOutlineClipboardList, HiOutlinePlus, HiOutlineDocumentText, HiOutlineChartBar, HiOutlineLightBulb, HiOutlinePencil } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { AI_LANGUAGE_OPTIONS, buildRequestedLanguages, toLegacyLanguageValue } from '../../../constants/aiLanguages';
import './ClassDetailPage.css';

const ClassDetailPage = () => {
    const { id } = useParams();
    const dispatch = useDispatch();
    const currentClass = useSelector(selectCurrentClass);
    const students = useSelector(selectClassStudents);
    const loading = useSelector(selectClassesLoading);
    const subjectsList = useSelector(selectSubjects);
    const teachersList = useSelector(selectTeachers);
    const departments = useSelector(selectDepartments);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const isAdmin = useSelector(selectIsAdmin);
    const canEditClass = useSelector(selectCanEditClass);

    const [showSubjectModal, setShowSubjectModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editFormData, setEditFormData] = useState({ grade: '', section: '', academicYear: '', department: '', room: '', capacity: 40, isActive: true });
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedTeacher, setSelectedTeacher] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [insightsPrimaryLanguage, setInsightsPrimaryLanguage] = useState('en');
    const [insightsSecondaryLanguage, setInsightsSecondaryLanguage] = useState('');

    const analytics = useSelector(selectClassAnalytics);
    const insightsData = useSelector(selectClassInsights);
    const analyticsLoading = useSelector(selectClassAnalyticsLoading);
    const insightsLoading = useSelector(selectClassInsightsLoading);

    useEffect(() => {
        dispatch(fetchClass(id));
        dispatch(fetchSubjects());
        dispatch(fetchTeachers());
        dispatch(fetchDepartments());
        dispatch(clearClassAnalyticsData());
    }, [dispatch, id]);

    const openEditModal = () => {
        if (currentClass) {
            setEditFormData({
                grade: currentClass.grade?.toString() ?? '',
                section: currentClass.section ?? '',
                academicYear: currentClass.academicYear ?? academicYear ?? '',
                department: currentClass.department?._id ?? currentClass.department ?? '',
                room: currentClass.room ?? '',
                capacity: currentClass.capacity ?? 40,
                isActive: currentClass.isActive !== false
            });
            setShowEditModal(true);
        }
    };

    const handleUpdateClass = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const payload = { ...editFormData, grade: parseInt(editFormData.grade, 10), capacity: editFormData.capacity || 40 };
            if (payload.department === '') payload.department = undefined;
            const result = await dispatch(updateClass({ id, data: payload }));
            if (updateClass.fulfilled.match(result)) {
                toast.success('Class updated successfully');
                setShowEditModal(false);
                dispatch(fetchClass(id));
            } else {
                toast.error(result.payload || 'Failed to update class');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleLoadAnalytics = () => {
        setShowAnalytics(true);
        dispatch(fetchClassAnalytics({ classId: id, academicYear: currentClass?.academicYear })).then((result) => {
            if (fetchClassAnalytics.rejected.match(result)) toast.error(result.payload || 'Failed to load analytics');
        });
    };

    const handleGenerateInsights = () => {
        const requestedLanguages = buildRequestedLanguages(insightsPrimaryLanguage, insightsSecondaryLanguage);
        const normalizedRequestedLanguages = requestedLanguages.length > 0 ? requestedLanguages : ['en'];
        dispatch(fetchClassInsights({
            classId: id,
            academicYear: currentClass?.academicYear,
            includeAnalytics: true,
            requestedLanguages: normalizedRequestedLanguages,
            primaryLanguage: insightsPrimaryLanguage,
            secondaryLanguage: insightsSecondaryLanguage,
            language: toLegacyLanguageValue(normalizedRequestedLanguages)
        })).then((result) => {
            if (fetchClassInsights.rejected.match(result)) toast.error(result.payload || 'Failed to generate insights');
            else toast.success('Insights generated');
        });
    };

    const handleAddSubject = async (e) => {
        e.preventDefault();

        if (!selectedSubject || !selectedTeacher) {
            toast.error('Please select both a subject and a teacher');
            return;
        }

        setSubmitting(true);
        try {
            const result = await dispatch(addSubjectToClass({
                classId: id,
                subjectId: selectedSubject,
                teacherId: selectedTeacher
            }));

            if (addSubjectToClass.fulfilled.match(result)) {
                toast.success('Subject added to class successfully');
                setShowSubjectModal(false);
                setSelectedSubject('');
                setSelectedTeacher('');
            } else {
                toast.error(result.payload || 'Failed to add subject');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveSubject = async (subjectId) => {
        if (!isAdmin) return;
        if (!window.confirm('Remove this subject from the class?')) return;

        const result = await dispatch(removeSubjectFromClass({ classId: id, subjectId }));
        if (removeSubjectFromClass.fulfilled.match(result)) {
            toast.success('Subject removed from class successfully');
        } else {
            toast.error(result.payload || 'Failed to remove subject');
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!currentClass) {
        return (
            <div className="not-found">
                <h2>Class not found</h2>
                <Link to="/portal/classes" className="btn btn-secondary">Back to Classes</Link>
            </div>
        );
    }

    return (
        <div className="class-detail-page">
            {/* Back Link */}
            <Link to="/portal/classes" className="back-link">
                <HiOutlineArrowLeft />
                Back to Classes
            </Link>

            {/* Header */}
            <div className="detail-header">
                <div className="class-info">
                    <div className="class-grade-lg">{currentClass.grade}</div>
                    <div>
                        <h1>{currentClass.name}</h1>
                        <p className="text-muted">{currentClass.academicYear} • {currentClass.department?.name ? `${currentClass.department.name} • ` : ''}{currentClass.room || 'No room assigned'}</p>
                    </div>
                </div>
                <div className="header-actions">
                    {canEditClass && (
                        <button type="button" className="btn btn-secondary" onClick={openEditModal}>
                            <HiOutlinePencil />
                            Edit Class
                        </button>
                    )}
                    <Link to={`/portal/grades/weekly/class/${id}`} className="btn btn-secondary">
                        <HiOutlineDocumentText />
                        Weekly Report
                    </Link>
                    <Link to={`/portal/classes/${id}/gradebook`} className="btn btn-secondary">
                        <HiOutlineBookOpen />
                        Gradebook
                    </Link>
                    <Link to={`/portal/grades/entry?class=${id}`} className="btn btn-primary">
                        <HiOutlineClipboardList />
                        Enter Grades
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="class-stats">
                <div className="stat-item">
                    <HiOutlineUserGroup size={24} />
                    <div>
                        <span className="stat-value">{students.length}</span>
                        <span className="stat-label">Students</span>
                    </div>
                </div>
                <div className="stat-item">
                    <HiOutlineBookOpen size={24} />
                    <div>
                        <span className="stat-value">{currentClass.subjects?.length || 0}</span>
                        <span className="stat-label">Subjects</span>
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            <div className="detail-grid">
                {/* Students List */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Students</h3>
                        <span className="badge badge-primary">{students.length} enrolled</span>
                    </div>
                    <div className="students-table">
                        {students.length > 0 ? (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>ID</th>
                                        <th>Gender</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map(student => (
                                        <tr key={student._id}>
                                            <td>
                                                <div className="student-cell">
                                                    <div className="avatar-sm">
                                                        {student.firstName?.charAt(0)}{student.lastName?.charAt(0)}
                                                    </div>
                                                    <span>{student.firstName} {student.lastName}</span>
                                                </div>
                                            </td>
                                            <td className="text-muted">{student.studentId}</td>
                                            <td className="text-muted text-capitalize">{student.gender}</td>
                                            <td>
                                                <Link to={`/portal/grades/student/${student._id}`} className="btn btn-ghost btn-sm">
                                                    Gradebook
                                                </Link>
                                                <Link to={`/portal/grades/report/${student._id}`} className="btn btn-ghost btn-sm">
                                                    View Report
                                                </Link>
                                                <Link to={`/portal/students/${student._id}`} className="btn btn-ghost btn-sm">
                                                    Details
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="empty-message">No students enrolled in this class yet.</p>
                        )}
                    </div>
                </div>

                {/* Subjects */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Subjects & Teachers</h3>
                        {isAdmin && (
                            <button className="btn btn-sm btn-primary" onClick={() => setShowSubjectModal(true)}>
                                <HiOutlinePlus /> Add Subject
                            </button>
                        )}
                    </div>
                    <div className="subjects-list">
                        {currentClass.subjects?.length > 0 ? (
                            currentClass.subjects.map((item, index) => {
                                const removableSubjectId = item.subject?._id || item.subject || item._id;

                                return (
                                    <div key={item._id || item.subject?._id || index} className="subject-item">
                                        <div className="subject-info">
                                            <span className="subject-name">{item.subject?.name || 'Unknown'}</span>
                                            <span className="subject-code">{item.subject?.code}</span>
                                        </div>
                                        <div className="teacher-info">
                                            <span className="teacher-name">
                                                {item.teacher?.user?.firstName || item.teacher?.user?.lastName
                                                    ? `${item.teacher?.user?.firstName || ''} ${item.teacher?.user?.lastName || ''}`.trim()
                                                    : 'Unassigned'}
                                            </span>
                                            {isAdmin && removableSubjectId && (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() => handleRemoveSubject(removableSubjectId)}
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <p className="empty-message">No subjects assigned to this class.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Analytics & Insights */}
            <div className="card analytics-card">
                <div className="card-header">
                    <h3 className="card-title">
                        <HiOutlineChartBar /> Analytics & AI Insights
                    </h3>
                    {!showAnalytics ? (
                        <button type="button" className="btn btn-secondary" onClick={handleLoadAnalytics} disabled={analyticsLoading}>
                            {analyticsLoading ? 'Loading...' : 'Load analytics'}
                        </button>
                    ) : (
                        <div className="insights-action-group">
                            <select
                                value={insightsPrimaryLanguage}
                                onChange={(event) => {
                                    const nextPrimary = event.target.value;
                                    setInsightsPrimaryLanguage(nextPrimary);
                                    if (nextPrimary === insightsSecondaryLanguage) {
                                        setInsightsSecondaryLanguage('');
                                    }
                                }}
                                disabled={insightsLoading}
                            >
                                {AI_LANGUAGE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <select
                                value={insightsSecondaryLanguage}
                                onChange={(event) => setInsightsSecondaryLanguage(event.target.value)}
                                disabled={insightsLoading}
                            >
                                <option value="">None</option>
                                {AI_LANGUAGE_OPTIONS
                                    .filter((option) => option.value !== insightsPrimaryLanguage)
                                    .map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                            </select>
                            <button type="button" className="btn btn-primary" onClick={handleGenerateInsights} disabled={insightsLoading}>
                                <HiOutlineLightBulb /> {insightsLoading ? 'Generating...' : 'Generate AI insights'}
                            </button>
                        </div>
                    )}
                </div>
                {showAnalytics && (
                    <div className="analytics-content">
                        {analyticsLoading && !analytics && <p className="text-muted">Loading analytics...</p>}
                        {analytics && !analyticsLoading && (
                            <>
                                <div className="analytics-summary">
                                    {analytics.gradeStatsBySubject?.length > 0 && (
                                        <div className="analytics-block">
                                            <h4>Class average by subject</h4>
                                            <ul className="analytics-list">
                                                {analytics.gradeStatsBySubject.map((s) => (
                                                    <li key={s.subjectId}>
                                                        <span className="subject-name">{s.subjectName}</span>
                                                        <span className="stat">{s.classAverage}%</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {analytics.attendanceSummary && (
                                        <div className="analytics-block">
                                            <h4>Attendance</h4>
                                            <p>
                                                {analytics.attendanceSummary.averageRate}% present
                                                {analytics.attendanceSummary.totalSessions != null && (
                                                    <span className="text-muted"> ({analytics.attendanceSummary.totalSessions} sessions)</span>
                                                )}
                                            </p>
                                        </div>
                                    )}
                                    {analytics.studentsToSupport?.length > 0 && (
                                        <div className="analytics-block">
                                            <h4>Students to support ({analytics.atRiskCount})</h4>
                                            <ul className="analytics-list">
                                                {analytics.studentsToSupport.map((s) => (
                                                    <li key={s._id}>
                                                        <Link to={`/portal/students/${s._id}`}>{s.firstName} {s.lastName}</Link>
                                                        {(s.averagePercentage != null || s.attendanceRate != null) && (
                                                            <span className="text-muted">
                                                                {s.averagePercentage != null && ` avg ${s.averagePercentage}%`}
                                                                {s.attendanceRate != null && ` attendance ${s.attendanceRate}%`}
                                                            </span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                {(insightsData?.insights || insightsData?.data?.insights) && (
                                    <div className="insights-block">
                                        <h4><HiOutlineLightBulb /> AI insights</h4>
                                        <div className="insights-text">
                                            {((insightsData?.insights ?? insightsData?.data?.insights) || '')
                                                .split(/\n+/)
                                                .filter(Boolean)
                                                .map((line, i) => (
                                                    <p key={i}>{line.replace(/^[-•]\s*/, '')}</p>
                                                ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Edit Class Modal */}
            {showEditModal && (
                <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Edit Class</h3>
                            <button className="modal-close" onClick={() => setShowEditModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleUpdateClass}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Grade Level *</label>
                                        <select
                                            value={editFormData.grade}
                                            onChange={(e) => setEditFormData({ ...editFormData, grade: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Grade</option>
                                            {[...Array(12)].map((_, i) => (
                                                <option key={i + 1} value={i + 1}>Grade {i + 1}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Section</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., A, B, C"
                                            value={editFormData.section}
                                            onChange={(e) => setEditFormData({ ...editFormData, section: e.target.value.toUpperCase() })}
                                            maxLength={2}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Academic Year *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., 2024-2025"
                                            value={editFormData.academicYear}
                                            onChange={(e) => setEditFormData({ ...editFormData, academicYear: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Department</label>
                                        <select
                                            value={editFormData.department}
                                            onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                                        >
                                            <option value="">— No department —</option>
                                            {departments.map((d) => (
                                                <option key={d._id} value={d._id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Room</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Room 101"
                                            value={editFormData.room}
                                            onChange={(e) => setEditFormData({ ...editFormData, room: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Capacity</label>
                                        <input
                                            type="number"
                                            value={editFormData.capacity}
                                            onChange={(e) => setEditFormData({ ...editFormData, capacity: parseInt(e.target.value, 10) || 40 })}
                                            min={1}
                                            max={100}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={editFormData.isActive}
                                            onChange={(e) => setEditFormData({ ...editFormData, isActive: e.target.checked })}
                                        />
                                        Active
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Subject Modal */}
            {showSubjectModal && (
                <div className="modal-overlay" onClick={() => setShowSubjectModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Add Subject to Class</h3>
                            <button className="modal-close" onClick={() => setShowSubjectModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleAddSubject}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Subject *</label>
                                    <select
                                        value={selectedSubject}
                                        onChange={(e) => setSelectedSubject(e.target.value)}
                                        required
                                    >
                                        <option value="">Select Subject</option>
                                        {subjectsList.map(subject => (
                                            <option key={subject._id} value={subject._id}>
                                                {subject.name} ({subject.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Teacher *</label>
                                    <select
                                        value={selectedTeacher}
                                        onChange={(e) => setSelectedTeacher(e.target.value)}
                                        required
                                    >
                                        <option value="">Select Teacher</option>
                                        {teachersList.map(teacher => (
                                            <option key={teacher._id} value={teacher._id}>
                                                {teacher.user?.firstName} {teacher.user?.lastName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowSubjectModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Adding...' : 'Add Subject'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClassDetailPage;
