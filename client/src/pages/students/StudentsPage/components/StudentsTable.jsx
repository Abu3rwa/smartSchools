import React from 'react';
import {
    HiOutlineMail,
    HiOutlinePencil,
    HiOutlineTrash
} from 'react-icons/hi';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { deleteStudent } from '../../../../store/slices/studentSlice';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

const resolveInviteState = (student) => {
    if (!student.user) return 'noAccount';
    const invite = student.user.loginInvite;
    if (invite?.deliveryStatus === 'sent') return 'sent';
    if (invite?.deliveryStatus === 'failed') return 'failed';
    return 'notSent';
};

const formatInviteTimestamp = (value) => {
    if (!value) return null;

    try {
        return new Date(value).toLocaleString();
    } catch {
        return null;
    }
};

const StudentsTable = ({
    students,
    isAdmin,
    loading,
    isAllSelected,
    selectedStudentIds,
    toggleSelectAllStudents,
    toggleSelectStudent,
    handleSendStudentInvite,
    sendingStudentInviteFor,
    handleSendParentInvite,
    sendingParentInviteFor,
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
                                    {students.length > 0 && (
                                        <input
                                            type="checkbox"
                                            checked={isAllSelected}
                                            onChange={toggleSelectAllStudents}
                                            title={t('students:table.selectAll')}
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
                            {isAdmin && <th>{t('students:table.columns.invite')}</th>}
                            {isAdmin && <th>{t('students:table.columns.actions')}</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((student) => {
                            const hasParentEmail = Boolean(
                                student.parentInfo?.fatherEmail ||
                                student.parentInfo?.motherEmail ||
                                student.parentInfo?.guardianEmail
                            );
                            const inviteState = resolveInviteState(student);
                            const lastInviteAt = formatInviteTimestamp(student.user?.loginInvite?.sentAt);
                            const isSendingStudentInvite = sendingStudentInviteFor === student._id;
                            const isSendingParentInvite = sendingParentInviteFor === student._id;
                            const isInactive = String(student.status || '').toLowerCase() === 'inactive';
                            const primaryEmail = student.email || student.studentEmail || student.user?.email || student.parentInfo?.fatherEmail;

                            return (
                                <tr key={student._id}>
                                    {isAdmin && (
                                        <td className="td-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={selectedStudentIds.has(student._id)}
                                                onChange={() => toggleSelectStudent(student._id)}
                                                title={t('students:table.selectStudent')}
                                            />
                                        </td>
                                    )}
                                    <td>
                                        <Link
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
                                                    <span className="student-email">{primaryEmail || t('students:table.noEmail')}</span>
                                                </div>
                                            </div>
                                        </Link>
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
                                            <div className="invite-status-cell">
                                                <span className={`badge badge-${inviteState === 'sent' ? 'success' : inviteState === 'failed' ? 'warning' : 'secondary'}`}>
                                                    {t(`students:invite.status.${inviteState}`)}
                                                </span>
                                                {lastInviteAt && (
                                                    <span className="invite-meta">
                                                        {t('students:invite.lastSentAt', { value: lastInviteAt })}
                                                    </span>
                                                )}
                                                <button
                                                    className="btn btn-xs btn-outline"
                                                    onClick={() => handleSendStudentInvite(student)}
                                                    disabled={isSendingStudentInvite}
                                                    title={student.user
                                                        ? t('students:actions.resendLoginInvite')
                                                        : t('students:actions.sendLoginInvite')}
                                                >
                                                    <HiOutlineMail size={14} />
                                                    <span>
                                                        {isSendingStudentInvite
                                                            ? t('students:actions.sendingInvite')
                                                            : student.user
                                                                ? t('students:actions.resendInvite')
                                                                : t('students:actions.sendInvite')}
                                                    </span>
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                    {isAdmin && (
                                        <td>
                                            <div className="student-actions">
                                                <button
                                                    className="btn-icon"
                                                    onClick={() => handleSendParentInvite(student)}
                                                    title={
                                                        isSendingParentInvite
                                                            ? t('students:actions.sendingParentInvite')
                                                            : hasParentEmail
                                                                ? t('students:actions.sendParentInvite')
                                                                : t('students:actions.noParentEmailOnFile')
                                                    }
                                                    disabled={!hasParentEmail || isSendingParentInvite}
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
                                                        const confirmMessage = isInactive
                                                            ? t('students:confirm.permanentDeleteInactive', { name: `${student.firstName} ${student.lastName}` })
                                                            : t('students:confirm.deleteStudent', { name: `${student.firstName} ${student.lastName}` });

                                                        if (window.confirm(confirmMessage)) {
                                                            dispatch(deleteStudent({ id: student._id, permanent: isInactive })).then((result) => {
                                                                if (deleteStudent.fulfilled.match(result)) {
                                                                    toast.success(isInactive ? t('students:toast.permanentlyDeleted') : t('students:toast.markedInactive'));
                                                                } else {
                                                                    toast.error(result.payload || t('students:toast.deleteFailed'));
                                                                }
                                                            });
                                                        }
                                                    }}
                                                    title={isInactive ? t('students:actions.permanentlyDeleteInactive') : t('students:actions.deleteStudent')}
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
                                <td colSpan={isAdmin ? 9 : 6} className="empty-row">
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

export default React.memo(StudentsTable);
