import React from 'react';
import {
    HiOutlineKey,
    HiOutlineUserAdd,
    HiOutlineMail,
    HiOutlinePencil,
    HiOutlineTrash
} from 'react-icons/hi';
import { useDispatch } from 'react-redux';
import { deleteStudent } from '../../../../store/slices/studentSlice';
import toast from 'react-hot-toast';

const StudentsTable = ({
    students,
    isAdmin,
    loading,
    studentsWithoutLogin,
    isAllWithoutLoginSelected,
    selectedStudentIds,
    toggleSelectAllWithoutLogin,
    toggleSelectStudent,
    handleResetPassword,
    handleCreateLogin,
    handleSendParentCredentials,
    sendingParentCredentialsFor,
    handleEdit
}) => {
    const dispatch = useDispatch();

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="card">
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            {isAdmin && (
                                <th className="th-checkbox">
                                    {studentsWithoutLogin.length > 0 && (
                                        <input
                                            type="checkbox"
                                            checked={isAllWithoutLoginSelected}
                                            onChange={() => toggleSelectAllWithoutLogin(studentsWithoutLogin, isAllWithoutLoginSelected)}
                                            title="Select all without login"
                                        />
                                    )}
                                </th>
                            )}
                            <th>Student</th>
                            <th>ID</th>
                            <th>Class</th>
                            <th>Department</th>
                            <th>Gender</th>
                            <th>Status</th>
                            {isAdmin && <th>Login</th>}
                            {isAdmin && <th>Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {students.map(student => {
                            const hasParentEmail = Boolean(
                                student.parentInfo?.fatherEmail ||
                                student.parentInfo?.motherEmail ||
                                student.parentInfo?.guardianEmail
                            );
                            return (
                                <tr key={student._id}>
                                    {isAdmin && (
                                        <td className="td-checkbox">
                                            {student.user ? (
                                                <span className="checkbox-placeholder" title="Has login">—</span>
                                            ) : (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedStudentIds.has(student._id)}
                                                    onChange={() => toggleSelectStudent(student._id, !!student.user)}
                                                    title="Select for bulk login"
                                                />
                                            )}
                                        </td>
                                    )}
                                    <td>
                                        <div className="student-cell">
                                            <div className={`avatar-sm ${student.photoUrl ? 'has-image' : ''}`}>
                                                {student.photoUrl ? (
                                                    <img
                                                        src={student.photoUrl}
                                                        alt={`${student.firstName} ${student.lastName}`}
                                                    />
                                                ) : (
                                                    <>{student.firstName?.charAt(0)}{student.lastName?.charAt(0)}</>
                                                )}
                                            </div>
                                            <div>
                                                <span className="student-name">{student.firstName} {student.lastName}</span>
                                                <span className="student-email">{student.email || student.parentInfo?.fatherEmail || 'No email'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="text-muted font-mono">{student.studentId}</td>
                                    <td>{student.currentClass?.name || 'Unassigned'}</td>
                                    <td>{student.department?.name ?? '—'}</td>
                                    <td className="text-capitalize">{student.gender}</td>
                                    <td>
                                        <span className={`badge badge-${student.status === 'active' ? 'success' : 'warning'}`}>
                                            {student.status}
                                        </span>
                                    </td>
                                    {isAdmin && (
                                        <td>
                                            {student.user ? (
                                                <div className="login-status">
                                                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Has Login</span>
                                                    <button
                                                        className="btn-icon"
                                                        onClick={() => handleResetPassword(student)}
                                                        title="Reset password"
                                                    >
                                                        <HiOutlineKey size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="btn btn-xs btn-outline"
                                                    onClick={() => handleCreateLogin(student)}
                                                    title="Create login account"
                                                >
                                                    <HiOutlineUserAdd size={14} />
                                                    <span>Create Login</span>
                                                </button>
                                            )}
                                        </td>
                                    )}
                                    {isAdmin && (
                                        <td>
                                            <div className="student-actions">
                                                <button
                                                    className="btn-icon"
                                                    onClick={() => handleSendParentCredentials(student)}
                                                    title={
                                                        sendingParentCredentialsFor === student._id
                                                            ? 'Sending credentials...'
                                                            : hasParentEmail
                                                                ? 'Send parent app credentials'
                                                                : 'No parent email on file'
                                                    }
                                                    disabled={!hasParentEmail || sendingParentCredentialsFor === student._id}
                                                >
                                                    <HiOutlineMail size={16} />
                                                </button>
                                                <button
                                                    className="btn-icon"
                                                    onClick={() => handleEdit(student)}
                                                    title="Edit student"
                                                >
                                                    <HiOutlinePencil size={16} />
                                                </button>
                                                <button
                                                    className="btn-icon text-danger"
                                                    onClick={() => {
                                                        if (window.confirm(`Delete ${student.firstName} ${student.lastName}?`)) {
                                                            dispatch(deleteStudent(student._id)).then(result => {
                                                                if (deleteStudent.fulfilled.match(result)) {
                                                                    toast.success('Student deleted');
                                                                } else {
                                                                    toast.error(result.payload || 'Failed to delete');
                                                                }
                                                            });
                                                        }
                                                    }}
                                                    title="Delete student"
                                                >
                                                    <HiOutlineTrash size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                        {students.length === 0 && (
                            <tr>
                                <td colSpan={isAdmin ? 9 : 5} className="empty-row">
                                    No students found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StudentsTable;
