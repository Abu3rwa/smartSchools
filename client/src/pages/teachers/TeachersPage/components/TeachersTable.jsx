import {
    HiOutlineEye,
    HiOutlineMail,
    HiOutlinePencil,
    HiOutlineTrash,
    HiOutlineUserGroup
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { getTeacherFullName, getTeacherInitials } from '../utils/teacherPresentation';

const resolveInviteState = (teacher) => {
    const invite = teacher.user?.loginInvite;
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

const TeachersTable = ({
    loading,
    teachers,
    canManageTeachers,
    selectedTeacherIds,
    isAllTeachersSelected,
    toggleSelectAllTeachers,
    toggleSelectTeacher,
    onView,
    onEdit,
    onAssign,
    onDelete,
    onSendInvite,
    sendingInviteTeacherId
}) => {
    const { t } = useTranslation(['teachers', 'common']);

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
                        {canManageTeachers && (
                            <th className="th-checkbox">
                                {teachers.length > 0 && (
                                    <input
                                        type="checkbox"
                                        checked={isAllTeachersSelected}
                                        onChange={toggleSelectAllTeachers}
                                        title={t('teachers:table.selectAll')}
                                    />
                                )}
                            </th>
                        )}
                        <th>{t('teachers:table.columns.name')}</th>
                        <th>{t('teachers:table.columns.email')}</th>
                        <th>{t('teachers:table.columns.subjects')}</th>
                        <th>{t('teachers:table.columns.invite')}</th>
                        <th>{t('teachers:table.columns.actions')}</th>
                    </tr>
                </thead>
                <tbody>
                    {teachers.map((teacher, index) => {
                        const inviteState = resolveInviteState(teacher);
                        const lastInviteAt = formatInviteTimestamp(teacher.user?.loginInvite?.sentAt);
                        const isSendingInvite = sendingInviteTeacherId === teacher._id;

                        return (
                            <tr key={teacher._id} className="animate-fadeIn" style={{ animationDelay: `${index * 0.05}s` }}>
                                {canManageTeachers && (
                                    <td className="td-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={selectedTeacherIds.has(teacher._id)}
                                            onChange={() => toggleSelectTeacher(teacher._id)}
                                            title={t('teachers:table.selectTeacher')}
                                        />
                                    </td>
                                )}
                                <td>
                                    <div className="teacher-name-cell">
                                        <div className="teacher-avatar">{getTeacherInitials(teacher)}</div>
                                        <div>
                                            <span>{getTeacherFullName(teacher)}</span>
                                            {teacher.employeeId && (
                                                <div className="invite-meta">{teacher.employeeId}</div>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div className="contact-cell">
                                        <HiOutlineMail />
                                        <span>{teacher.user?.email || t('teachers:invite.noEmail')}</span>
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
                                        {!teacher.subjects?.length && (
                                            <span className="text-muted">{t('teachers:table.noSubjects')}</span>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <div className="invite-status-cell">
                                        <span className={`badge badge-${inviteState === 'sent' ? 'success' : inviteState === 'failed' ? 'warning' : 'secondary'}`}>
                                            {t(`teachers:invite.status.${inviteState}`)}
                                        </span>
                                        {lastInviteAt && (
                                            <span className="invite-meta">
                                                {t('teachers:invite.lastSentAt', { value: lastInviteAt })}
                                            </span>
                                        )}
                                        {canManageTeachers && (
                                            <button
                                                className="btn btn-xs btn-outline"
                                                onClick={() => onSendInvite(teacher)}
                                                disabled={isSendingInvite}
                                                title={teacher.user?.loginInvite?.sentAt
                                                    ? t('teachers:actions.resendLoginInvite')
                                                    : t('teachers:actions.sendLoginInvite')}
                                            >
                                                <HiOutlineMail size={14} />
                                                <span>
                                                    {isSendingInvite
                                                        ? t('teachers:actions.sendingInvite')
                                                        : teacher.user?.loginInvite?.sentAt
                                                            ? t('teachers:actions.resendInvite')
                                                            : t('teachers:actions.sendInvite')}
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <div className="actions-cell">
                                        <button
                                            className="btn btn-sm btn-primary"
                                            onClick={() => onView(teacher)}
                                            title={t('teachers:actions.viewDetails')}
                                        >
                                            <HiOutlineEye size={16} />
                                            {t('common:actions.view')}
                                        </button>
                                        {canManageTeachers && (
                                            <>
                                                <button
                                                    className="btn btn-sm btn-ghost"
                                                    onClick={() => onEdit(teacher)}
                                                    title={t('teachers:actions.editTeacher')}
                                                >
                                                    <HiOutlinePencil size={16} />
                                                    {t('common:actions.edit')}
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-ghost"
                                                    onClick={() => onAssign(teacher)}
                                                    title={t('teachers:actions.assignClasses')}
                                                >
                                                    <HiOutlineUserGroup size={16} />
                                                    {t('teachers:actions.assign')}
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() => onDelete(teacher)}
                                                    title={t('teachers:actions.deleteTeacher')}
                                                >
                                                    <HiOutlineTrash size={16} />
                                                    {t('common:actions.delete')}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {teachers.length === 0 && (
                <div className="empty-state">
                    <p>{t('teachers:empty.noTeachers')}</p>
                </div>
            )}
        </div>
    );
};

export default TeachersTable;
