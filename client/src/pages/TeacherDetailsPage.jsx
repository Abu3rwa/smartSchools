import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchTeachers, selectTeachers, fetchTeacher, selectCurrentTeacher } from '../store/slices/teacherSlice';
import { fetchClasses, selectClasses } from '../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import { HiOutlineArrowLeft, HiOutlineMail, HiOutlinePhone, HiOutlineAcademicCap, HiOutlineUserGroup, HiOutlineCalendar, HiOutlineLocationMarker, HiOutlineBookOpen } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './TeacherDetailsPage.css';

const TeacherDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const teachers = useSelector(selectTeachers);
    const currentTeacher = useSelector(selectCurrentTeacher);
    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                
                // Load all teachers for dropdown
                await dispatch(fetchTeachers()).unwrap();
                
                // Load current teacher details
                if (id) {
                    await dispatch(fetchTeacher(id)).unwrap();
                }
                
                // Load classes and subjects for assignment details
                await Promise.all([
                    dispatch(fetchClasses()).unwrap(),
                    dispatch(fetchSubjects()).unwrap()
                ]);
            } catch (error) {
                toast.error('Failed to load teacher details');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [dispatch, id]);

    const handleTeacherChange = (teacherId) => {
        navigate(`/portal/teachers/${teacherId}`);
    };

    if (loading) {
        return (
            <div className="teacher-details-page">
                <div className="loading-container">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    if (!currentTeacher) {
        return (
            <div className="teacher-details-page">
                <div className="empty-state">
                    <h3>Teacher not found</h3>
                    <button className="btn btn-primary" onClick={() => navigate('/portal/teachers')}>
                        Back to Teachers
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="teacher-details-page">
            {/* Header */}
            <div className="details-header">
                <button className="btn btn-ghost" onClick={() => navigate('/portal/teachers')}>
                    <HiOutlineArrowLeft size={20} />
                    Back to Teachers
                </button>
                
                {/* Teacher Selector Dropdown */}
                <div className="teacher-selector">
                    <label htmlFor="teacher-select">View Teacher:</label>
                    <select
                        id="teacher-select"
                        value={currentTeacher._id}
                        onChange={(e) => handleTeacherChange(e.target.value)}
                        className="form-select"
                    >
                        {teachers.map(teacher => (
                            <option key={teacher._id} value={teacher._id}>
                                {teacher.user?.firstName} {teacher.user?.lastName} - {teacher.employeeId}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Teacher Profile Card */}
            <div className="teacher-profile-card">
                <div className="profile-header">
                    <div className="teacher-avatar-large">
                        {currentTeacher.user?.firstName?.charAt(0)}{currentTeacher.user?.lastName?.charAt(0)}
                    </div>
                    <div className="profile-info">
                        <h1>{currentTeacher.user?.firstName} {currentTeacher.user?.lastName}</h1>
                        <div className="profile-meta">
                            <span className="employee-id-large">{currentTeacher.employeeId}</span>
                            <span className="department-badge-large">{currentTeacher.department || 'General'}</span>
                        </div>
                    </div>
                </div>

                <div className="profile-grid">
                    {/* Contact Information */}
                    <div className="info-section">
                        <h3><HiOutlineMail /> Contact Information</h3>
                        <div className="info-grid">
                            <div className="info-item">
                                <label>Email</label>
                                <span>{currentTeacher.user?.email}</span>
                            </div>
                            {currentTeacher.user?.phone && (
                                <div className="info-item">
                                    <label>Phone</label>
                                    <span>{currentTeacher.user?.phone}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Academic Information */}
                    <div className="info-section">
                        <h3><HiOutlineAcademicCap /> Academic Information</h3>
                        <div className="info-grid">
                            <div className="info-item">
                                <label>Qualification</label>
                                <span>{currentTeacher.qualification || 'Not specified'}</span>
                            </div>
                            <div className="info-item">
                                <label>Department</label>
                                <span>{currentTeacher.department || 'General'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Subjects */}
                    <div className="info-section">
                        <h3><HiOutlineBookOpen /> Subjects</h3>
                        <div className="subjects-list">
                            {currentTeacher.subjects?.length > 0 ? (
                                currentTeacher.subjects.map(subject => (
                                    <div key={subject._id} className="subject-card">
                                        <h4>{subject.name}</h4>
                                        <span className="subject-code">{subject.code}</span>
                                        {subject.description && (
                                            <p className="subject-description">{subject.description}</p>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted">No subjects assigned</p>
                            )}
                        </div>
                    </div>

                    {/* Class Assignments */}
                    <div className="info-section">
                        <h3><HiOutlineUserGroup /> Class Assignments</h3>
                        <div className="assignments-list">
                            {currentTeacher.assignedClasses?.length > 0 ? (
                                currentTeacher.assignedClasses.map(assignment => (
                                    <div key={assignment._id} className="assignment-card">
                                        <div className="assignment-header">
                                            <h4>{assignment.class?.name}</h4>
                                            {assignment.isClassTeacher && (
                                                <span className="class-teacher-badge">Class Teacher</span>
                                            )}
                                        </div>
                                        <div className="assignment-details">
                                            <span className="subject-name">{assignment.subject?.name}</span>
                                            <span className="academic-year">{assignment.class?.academicYear}</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted">No class assignments</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TeacherDetailsPage;
