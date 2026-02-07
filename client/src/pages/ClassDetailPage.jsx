import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchClass, selectCurrentClass, selectClassStudents, selectClassesLoading, addSubjectToClass } from '../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import { fetchTeachers, selectTeachers } from '../store/slices/teacherSlice';
import { selectIsAdmin } from '../store/slices/authSlice';
import { HiOutlineArrowLeft, HiOutlineUserGroup, HiOutlineBookOpen, HiOutlinePencil, HiOutlineClipboardList, HiOutlinePlus, HiOutlineDocumentText } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './ClassDetailPage.css';

const ClassDetailPage = () => {
    const { id } = useParams();
    const dispatch = useDispatch();
    const currentClass = useSelector(selectCurrentClass);
    const students = useSelector(selectClassStudents);
    const loading = useSelector(selectClassesLoading);
    const subjectsList = useSelector(selectSubjects);
    const teachersList = useSelector(selectTeachers);
    const isAdmin = useSelector(selectIsAdmin);

    const [showSubjectModal, setShowSubjectModal] = useState(false);
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedTeacher, setSelectedTeacher] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        dispatch(fetchClass(id));
        dispatch(fetchSubjects());
        dispatch(fetchTeachers());
    }, [dispatch, id]);

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
                        <p className="text-muted">{currentClass.academicYear} • {currentClass.room || 'No room assigned'}</p>
                    </div>
                </div>
                <div className="header-actions">
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
                                                <Link to={`/portal/grades/report/${student._id}`} className="btn btn-ghost btn-sm">
                                                    View Report
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
                            currentClass.subjects.map((item, index) => (
                                <div key={index} className="subject-item">
                                    <div className="subject-info">
                                        <span className="subject-name">{item.subject?.name || 'Unknown'}</span>
                                        <span className="subject-code">{item.subject?.code}</span>
                                    </div>
                                    <div className="teacher-info">
                                        <span className="teacher-name">
                                            {item.teacher?.user?.firstName} {item.teacher?.user?.lastName}
                                        </span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="empty-message">No subjects assigned to this class.</p>
                        )}
                    </div>
                </div>
            </div>
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
