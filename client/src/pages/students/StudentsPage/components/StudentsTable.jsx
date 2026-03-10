import React from 'react';
import {
    HiOutlineKey,
    HiOutlineUserAdd,
    HiOutlineMail,
    HiOutlinePencil,
    HiOutlineTrash
} from 'react-icons/hi';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { deleteStudent } from '../../../../store/slices/studentSlice';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

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
    const { t } = useTranslation(['students']);

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
                                            title={t('students:table.selectAllWithoutLogin')}
                                        />
                                    )}
                                </th>
                            )}
                            <th>{t('students:table.columns.student')}</th>
                            <th>{t('students:table.columns.id')}</th>
                            <th>{t('students:table.columns.class')}</th>
                            <th>{t('students:table.columns.department')}</th>
                            <th>{t('students:table.columns.gender')}</th>
                            <th>{t('students:table.columns.status')}</th>
                            {isAdmin && <th>{t('students:table.columns.login')}</th>}
                            {isAdmin && <th>{t('students:table.columns.actions')}</th>}
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
                                                                    <span className="checkbox-placeholder" title={t('students:table.hasLogin')}>—</span>
                                                                ) : (
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedStudentIds.has(student._id)}
                                                                        onChange={() => toggleSelectStudent(student._id, !!student.user)}
                                                                        title={t('students:table.selectForBulkLogin')}
                                                                    />
                                                                )}
                                                            </td>
                                                        )}
                                                        <td>
                                                            <Link
                        key={student._id}
                        to={`/portal/students/${student._id}`}
                        className="student-item animate-fadeIn"
                     >  
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
                                                                    <span className="student-email">{student.email || student.parentInfo?.fatherEmail || t('students:table.noEmail')}</span>
                                                                </div>
                                                            </div></Link>
                                                        </td>
                                                        <td className="text-muted font-mono">{student.studentId}</td>
                                                        <td>{student.currentClass?.name || t('students:table.unassigned')}</td>
                                                        <td>{student.department?.name ?? '—'}</td>
                                                        <td className="text-capitalize">{t(`students:genders.${student.gender || 'other'}`)}</td>
                                                        <td>
                                                            <span className={`badge badge-${student.status === 'active' ? 'success' : 'warning'}`}>
                                                                {t(`students:status.${student.status || 'inactive'}`)}
                                                            </span>
                                                        </td>
                                                        {isAdmin && (
                                                            <td>
                                                                {student.user ? (
                                                                    <div className="login-status">
                                                                        <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>{t('students:table.hasLogin')}</span>
                                                                        <button
                                                                            className="btn-icon"
                                                                            onClick={() => handleResetPassword(student)}
                                                                            title={t('students:actions.resetPassword')}
                                                                        >
                                                                            <HiOutlineKey size={16} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        className="btn btn-xs btn-outline"
                                                                        onClick={() => handleCreateLogin(student)}
                                                                        title={t('students:actions.createLoginAccount')}
                                                                    >
                                                                        <HiOutlineUserAdd size={14} />
                                                                        <span>{t('students:actions.createLogin')}</span>
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
                                                                                ? t('students:actions.sendingCredentials')
                                                                                : hasParentEmail
                                                                                    ? t('students:actions.sendParentAppCredentials')
                                                                                    : t('students:actions.noParentEmailOnFile')
                                                                        }
                                                                        disabled={!hasParentEmail || sendingParentCredentialsFor === student._id}
                                                                    >
                                                                        <HiOutlineMail size={16} />
                                                                    </button>
                                                                    <button
                                                                        className="btn-icon"
                                                                        onClick={() => handleEdit(student)}
                                                                        title={t('students:actions.editStudent')}
                                                                    >
                                                                        <HiOutlinePencil size={16} />
                                                                    </button>
                                                                    <button
                                                                        className="btn-icon text-danger"
                                                                        onClick={() => {
                                                                            if (window.confirm(t('students:confirm.deleteStudent', { name: `${student.firstName} ${student.lastName}` }))) {
                                                                                dispatch(deleteStudent(student._id)).then(result => {
                                                                                    if (deleteStudent.fulfilled.match(result)) {
                                                                                        toast.success(t('students:toast.deleted'));
                                                                                    } else {
                                                                                        toast.error(result.payload || t('students:toast.deleteFailed'));
                                                                                    }
                                                                                });
                                                                            }
                                                                        }}
                                                                        title={t('students:actions.deleteStudent')}
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
                                    {t('students:empty.noStudents')}
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
