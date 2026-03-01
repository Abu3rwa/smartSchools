import {
    HiOutlineAcademicCap,
    HiOutlineBookOpen,
    HiOutlineMail,
    HiOutlinePhone
} from 'react-icons/hi';
import {
    getTeacherDepartmentName,
    getTeacherFullName,
    getTeacherInitials,
    getTeacherQualification
} from '../utils/teacherDetailsPresentation';
import { TEACHER_DETAILS_MESSAGES } from '../constants';

const TeacherInfoPanel = ({ teacher }) => {
    return (
        <>
            <div className="profile-header">
                <div className="teacher-avatar-large">
                    {getTeacherInitials(teacher)}
                </div>
                <div className="profile-info">
                    <h1>{getTeacherFullName(teacher)}</h1>
                    <div className="profile-meta">
                        <span className="employee-id-large">{teacher?.employeeId}</span>
                        <span className="department-badge-large">{getTeacherDepartmentName(teacher)}</span>
                    </div>
                </div>
            </div>

            <div className="profile-grid">
                <div className="info-section">
                    <h3><HiOutlineMail /> Contact Information</h3>
                    <div className="info-grid">
                        <div className="info-item">
                            <label>Email</label>
                            <span>{teacher?.user?.email}</span>
                        </div>
                        {teacher?.user?.phone && (
                            <div className="info-item">
                                <label>Phone</label>
                                <span>{teacher.user.phone}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="info-section">
                    <h3><HiOutlineAcademicCap /> Academic Information</h3>
                    <div className="info-grid">
                        <div className="info-item">
                            <label>Qualification</label>
                            <span>{getTeacherQualification(teacher)}</span>
                        </div>
                        <div className="info-item">
                            <label>Department</label>
                            <span>{getTeacherDepartmentName(teacher)}</span>
                        </div>
                    </div>
                </div>

                <div className="info-section">
                    <h3><HiOutlineBookOpen /> Subjects</h3>
                    <div className="subjects-list">
                        {teacher?.subjects?.length > 0 ? (
                            teacher.subjects.map((subject) => (
                                <div key={subject._id} className="subject-card">
                                    <h4>{subject.name}</h4>
                                    <span className="subject-code">{subject.code}</span>
                                    {subject.description && (
                                        <p className="subject-description">{subject.description}</p>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-muted">{TEACHER_DETAILS_MESSAGES.NO_SUBJECTS}</p>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default TeacherInfoPanel;
