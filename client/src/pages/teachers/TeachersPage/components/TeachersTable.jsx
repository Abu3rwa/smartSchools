import {
    HiOutlineEye,
    HiOutlineMail,
    HiOutlinePencil,
    HiOutlineTrash,
    HiOutlineUserGroup
} from 'react-icons/hi';
import { getTeacherFullName, getTeacherInitials } from '../utils/teacherPresentation';

const TeachersTable = ({
    loading,
    teachers,
    canManageTeachers,
    onView,
    onEdit,
    onAssign,
    onDelete
}) => {
    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Employee ID</th>
                        <th>Department</th>
                        <th>Email</th>
                        <th>Subjects</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {teachers.map((teacher, index) => (
                        <tr key={teacher._id} className="animate-fadeIn" style={{ animationDelay: `${index * 0.05}s` }}>
                            <td>
                                <div className="teacher-name-cell">
                                    <div className="teacher-avatar">{getTeacherInitials(teacher)}</div>
                                    <span>{getTeacherFullName(teacher)}</span>
                                </div>
                            </td>
                            <td>
                                <span className="employee-id-badge">{teacher.employeeId}</span>
                            </td>
                            <td>
                                <span>{teacher.department?.name ?? '—'}</span>
                            </td>
                            <td>
                                <div className="contact-cell">
                                    <HiOutlineMail />
                                    <span>{teacher.user?.email}</span>
                                </div>
                            </td>
                            <td>
                                <div className="subjects-cell">
                                    {teacher.subjects?.slice(0, 3).map((subject) => (
                                        <span key={subject._id} className="subject-tag">{subject.code}</span>
                                    ))}
                                    {teacher.subjects?.length > 3 && (
                                        <span className="subject-tag more">+{teacher.subjects.length - 3}</span>
                                    )}
                                </div>
                            </td>
                            <td>
                                <div className="actions-cell">
                                    <button
                                        className="btn btn-sm btn-primary"
                                        onClick={() => onView(teacher)}
                                        title="View Details"
                                    >
                                        <HiOutlineEye size={16} />
                                        View
                                    </button>
                                    {canManageTeachers && (
                                        <>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                onClick={() => onEdit(teacher)}
                                                title="Edit Teacher"
                                            >
                                                <HiOutlinePencil size={16} />
                                                Edit
                                            </button>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                onClick={() => onAssign(teacher)}
                                                title="Assign Classes"
                                            >
                                                <HiOutlineUserGroup size={16} />
                                                Assign
                                            </button>
                                            <button
                                                className="btn btn-sm btn-danger"
                                                onClick={() => onDelete(teacher)}
                                                title="Delete Teacher"
                                            >
                                                <HiOutlineTrash size={16} />
                                                Delete
                                            </button>
                                        </>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {teachers.length === 0 && (
                <div className="empty-state">
                    <p>No teachers found</p>
                </div>
            )}
        </div>
    );
};

export default TeachersTable;
