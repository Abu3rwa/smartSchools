import React, { useMemo, useState } from 'react';
import {
    HiOutlineExclamationCircle,
    HiOutlineInbox,
    HiOutlineMail,
    HiOutlinePencil,
    HiOutlineSearch,
    HiOutlineTrash
} from 'react-icons/hi';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@mui/material';
import { deleteStudent } from '../../../../store/slices/studentSlice';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import ConfirmDialog from '../../../../components/common/ConfirmDialog';

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
    error,
    onRetry,
    isFiltered,
    onClearFilters,
    isAllSelected,
    selectedStudentIds,
    toggleSelectAllStudents,
    toggleSelectStudent,
    handleSendStudentInvite,
    sendingStudentInviteFor,
    handleSendParentInvite,
    sendingParentInviteFor,
    handleEdit,
    onStudentDeleted,
    onAddStudent
}) => {
    const dispatch = useDispatch();
    const { t } = useTranslation(['students', 'common']);
    const isCompact = useMediaQuery('(max-width: 899px)');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const rows = useMemo(() => students.map((student) => {
        const hasParentEmail = Boolean(
            student.parentInfo?.fatherEmail ||
            student.parentInfo?.motherEmail ||
            student.parentInfo?.guardianEmail
        );
        const isInactive = String(student.status || '').toLowerCase() === 'inactive';

        return {
            student,
            hasParentEmail,
            isInactive,
            inviteState: resolveInviteState(student),
            lastInviteAt: formatInviteTimestamp(student.user?.loginInvite?.sentAt),
            isSendingStudentInvite: sendingStudentInviteFor === student._id,
            isSendingParentInvite: sendingParentInviteFor === student._id,
            primaryEmail: student.email || student.studentEmail || student.user?.email || student.parentInfo?.fatherEmail
        };
    }), [students, sendingStudentInviteFor, sendingParentInviteFor]);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        const result = await dispatch(deleteStudent({
            id: deleteTarget.student._id,
            permanent: deleteTarget.isInactive
        }));
        setDeleting(false);

        if (deleteStudent.fulfilled.match(result)) {
            toast.success(deleteTarget.isInactive
                ? t('students:toast.permanentlyDeleted')
                : t('students:toast.markedInactive'));
            setDeleteTarget(null);
            if (typeof onStudentDeleted === 'function') {
                onStudentDeleted();
            }
        } else {
            toast.error(result.payload || t('students:toast.deleteFailed'));
        }
    };

    const renderAvatar = (student) => (
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
    );

    const renderStatusBadge = (student) => (
        <span className={`badge badge-${student.status === 'active' ? 'success' : 'warning'}`}>
            {t(`students:status.${student.status || 'inactive'}`)}
        </span>
    );

    const renderInviteBadge = (row) => (
        <span className={`badge badge-${row.inviteState === 'sent' ? 'success' : row.inviteState === 'failed' ? 'warning' : 'secondary'}`}>
            {t(`students:invite.status.${row.inviteState}`)}
        </span>
    );

    const renderStudentInviteButton = (row) => (
        <button
            type="button"
            className="btn btn-xs btn-outline"
            onClick={() => handleSendStudentInvite(row.student)}
            disabled={row.isSendingStudentInvite}
            title={row.student.user
                ? t('students:actions.resendLoginInvite')
                : t('students:actions.sendLoginInvite')}
            aria-label={row.student.user
                ? t('students:actions.resendLoginInvite')
                : t('students:actions.sendLoginInvite')}
        >
            <HiOutlineMail size={14} aria-hidden="true" />
            <span>
                {row.isSendingStudentInvite
                    ? t('students:actions.sendingInvite')
                    : row.student.user
                        ? t('students:actions.resendInvite')
                        : t('students:actions.sendInvite')}
            </span>
        </button>
    );

    const renderRowActions = (row) => (
        <div className="student-actions">
            <button
                type="button"
                className="btn-icon"
                onClick={() => handleSendParentInvite(row.student)}
                title={
                    row.isSendingParentInvite
                        ? t('students:actions.sendingParentInvite')
                        : row.hasParentEmail
                            ? t('students:actions.sendParentInvite')
                            : t('students:actions.noParentEmailOnFile')
                }
                aria-label={t('students:actions.sendParentInvite')}
                disabled={!row.hasParentEmail || row.isSendingParentInvite}
            >
                <HiOutlineMail size={16} />
            </button>
            <button
                type="button"
                className="btn-icon"
                onClick={() => handleEdit(row.student)}
                title={t('students:actions.editStudent')}
                aria-label={t('students:actions.editStudent')}
            >
                <HiOutlinePencil size={16} />
            </button>
            <button
                type="button"
                className="btn-icon btn-icon-danger"
                onClick={() => setDeleteTarget(row)}
                title={row.isInactive ? t('students:actions.permanentlyDeleteInactive') : t('students:actions.deleteStudent')}
                aria-label={row.isInactive ? t('students:actions.permanentlyDeleteInactive') : t('students:actions.deleteStudent')}
            >
                <HiOutlineTrash size={16} />
            </button>
        </div>
    );

    if (loading && students.length === 0) {
        return (
            <div className="gp-surface students-table-surface" aria-busy="true" aria-live="polite">
                <span className="gp-sr-only">{t('students:states.loading')}</span>
                {[0, 1, 2, 3, 4, 5].map((row) => (
                    <div className="gp-skeleton-row" key={row}>
                        <div className="gp-skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                        <div className="gp-skeleton-lines">
                            <div className="gp-skeleton" style={{ width: '38%', height: 12 }} />
                            <div className="gp-skeleton" style={{ width: '62%', height: 10 }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (error && students.length === 0) {
        return (
            <div className="gp-surface">
                <div className="gp-empty" role="alert">
                    <span className="gp-empty-icon">
                        <HiOutlineExclamationCircle size={26} />
                    </span>
                    <h3>{t('students:states.loadFailedTitle')}</h3>
                    <p>{t('students:states.loadFailedBody')}</p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
                        {t('common:actions.retry')}
                    </button>
                </div>
            </div>
        );
    }

    if (students.length === 0) {
        return (
            <div className="gp-surface">
                <div className="gp-empty students-empty-state">
                    {isFiltered ? (
                        <>
                            <span className="gp-empty-icon">
                                <HiOutlineSearch size={26} />
                            </span>
                            <h3>{t('students:empty.noMatches')}</h3>
                            <p>{t('students:empty.noMatchesHint')}</p>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={onClearFilters}>
                                {t('students:filters.clearAll')}
                            </button>
                        </>
                    ) : (
                        <>
                            <span className="gp-empty-icon">
                                <HiOutlineInbox size={26} />
                            </span>
                            <h3>{t('students:empty.noStudents')}</h3>
                            <p>{isAdmin
                                ? t('students:empty.noStudentsHint')
                                : t('students:empty.teacherHint')}</p>
                            {isAdmin && onAddStudent && (
                                <button type="button" className="btn btn-primary btn-sm" onClick={onAddStudent}>
                                    {t('students:actions.addStudent')}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }

    if (isCompact) {
        return (
            <>
                {isAdmin && (
                    <div className="students-list-select">
                        <label>
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={toggleSelectAllStudents}
                            />
                            <span>{t('students:table.selectAll')}</span>
                        </label>
                        <span className="students-list-count">
                            {t('students:table.visibleCount', { total: students.length })}
                        </span>
                    </div>
                )}
                <div className="students-card-list">
                    {rows.map((row) => (
                        <article className="students-card" key={row.student._id}>
                            <div className="students-card-head">
                                {isAdmin && (
                                    <input
                                        type="checkbox"
                                        checked={selectedStudentIds.has(row.student._id)}
                                        onChange={() => toggleSelectStudent(row.student._id)}
                                        title={t('students:table.selectStudent')}
                                    />
                                )}
                                {renderAvatar(row.student)}
                                <div className="students-card-identity">
                                    <Link to={`/portal/students/${row.student._id}`} className="student-name">
                                        {row.student.firstName} {row.student.lastName}
                                    </Link>
                                    <span className="student-email">{row.primaryEmail || t('students:table.noEmail')}</span>
                                </div>
                                {renderStatusBadge(row.student)}
                            </div>
                            <dl className="students-card-meta">
                                <div>
                                    <dt>{t('students:table.columns.id')}</dt>
                                    <dd className="font-mono">{row.student.studentId}</dd>
                                </div>
                                <div>
                                    <dt>{t('students:table.columns.class')}</dt>
                                    <dd>{row.student.currentClass?.name || t('students:table.unassigned')}</dd>
                                </div>
                                <div>
                                    <dt>{t('students:table.columns.department')}</dt>
                                    <dd>{row.student.department?.name ?? '—'}</dd>
                                </div>
                                <div>
                                    <dt>{t('students:table.columns.gender')}</dt>
                                    <dd className="text-capitalize">{t(`students:genders.${row.student.gender || 'other'}`)}</dd>
                                </div>
                                {isAdmin && (
                                    <div className="students-card-invite">
                                        <dt>{t('students:table.columns.invite')}</dt>
                                        <dd>
                                            <div className="invite-status-cell">
                                                <span className="students-card-invite-row">
                                                    {renderInviteBadge(row)}
                                                    {row.lastInviteAt && (
                                                        <span className="invite-meta">
                                                            {t('students:invite.lastSentAt', { value: row.lastInviteAt })}
                                                        </span>
                                                    )}
                                                </span>
                                                {renderStudentInviteButton(row)}
                                            </div>
                                        </dd>
                                    </div>
                                )}
                            </dl>
                            {isAdmin && (
                                <div className="students-card-actions">
                                    {renderRowActions(row)}
                                </div>
                            )}
                        </article>
                    ))}
                </div>
                <ConfirmDialog
                    open={Boolean(deleteTarget)}
                    title={deleteTarget?.isInactive
                        ? t('students:actions.permanentlyDeleteInactive')
                        : t('students:actions.deleteStudent')}
                    message={deleteTarget
                        ? t(deleteTarget.isInactive
                            ? 'students:confirm.permanentDeleteInactive'
                            : 'students:confirm.deleteStudent', {
                            name: `${deleteTarget.student.firstName} ${deleteTarget.student.lastName}`
                        })
                        : ''}
                    confirmLabel={deleteTarget?.isInactive
                        ? t('students:actions.permanentlyDeleteInactive')
                        : t('students:actions.deleteStudent')}
                    cancelLabel={t('common:actions.cancel')}
                    closeLabel={t('common:actions.close')}
                    tone="danger"
                    busy={deleting}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            </>
        );
    }

    return (
        <div className="gp-surface students-table-surface">
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
                            <th className="col-department">{t('students:table.columns.department')}</th>
                            <th className="col-gender">{t('students:table.columns.gender')}</th>
                            <th>{t('students:table.columns.status')}</th>
                            {isAdmin && <th>{t('students:table.columns.invite')}</th>}
                            {isAdmin && <th>{t('students:table.columns.actions')}</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.student._id}>
                                {isAdmin && (
                                    <td className="td-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={selectedStudentIds.has(row.student._id)}
                                            onChange={() => toggleSelectStudent(row.student._id)}
                                            title={t('students:table.selectStudent')}
                                        />
                                    </td>
                                )}
                                <td>
                                    <Link
                                        to={`/portal/students/${row.student._id}`}
                                        className="student-item animate-fadeIn"
                                    >
                                        <div className="student-cell">
                                            {renderAvatar(row.student)}
                                            <div className="student-cell-text">
                                                <span
                                                    className="student-name"
                                                    title={`${row.student.firstName} ${row.student.lastName}`}
                                                >
                                                    {row.student.firstName} {row.student.lastName}
                                                </span>
                                                <span className="student-email" title={row.primaryEmail || undefined}>
                                                    {row.primaryEmail || t('students:table.noEmail')}
                                                </span>
                                                <span className="student-meta-line">
                                                    {row.student.department?.name ?? '—'}
                                                    {' · '}
                                                    {t(`students:genders.${row.student.gender || 'other'}`)}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                </td>
                                <td className="text-muted font-mono">{row.student.studentId}</td>
                                <td>{row.student.currentClass?.name || t('students:table.unassigned')}</td>
                                <td className="col-department">{row.student.department?.name ?? '—'}</td>
                                <td className="col-gender text-capitalize">{t(`students:genders.${row.student.gender || 'other'}`)}</td>
                                <td>{renderStatusBadge(row.student)}</td>
                                {isAdmin && (
                                    <td>
                                        <div className="invite-status-cell">
                                            {renderInviteBadge(row)}
                                            {row.lastInviteAt && (
                                                <span className="invite-meta">
                                                    {t('students:invite.lastSentAt', { value: row.lastInviteAt })}
                                                </span>
                                            )}
                                            {renderStudentInviteButton(row)}
                                        </div>
                                    </td>
                                )}
                                {isAdmin && (
                                    <td>{renderRowActions(row)}</td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title={deleteTarget?.isInactive
                    ? t('students:actions.permanentlyDeleteInactive')
                    : t('students:actions.deleteStudent')}
                message={deleteTarget
                    ? t(deleteTarget.isInactive
                        ? 'students:confirm.permanentDeleteInactive'
                        : 'students:confirm.deleteStudent', {
                        name: `${deleteTarget.student.firstName} ${deleteTarget.student.lastName}`
                    })
                    : ''}
                confirmLabel={deleteTarget?.isInactive
                    ? t('students:actions.permanentlyDeleteInactive')
                    : t('students:actions.deleteStudent')}
                cancelLabel={t('common:actions.cancel')}
                closeLabel={t('common:actions.close')}
                tone="danger"
                busy={deleting}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
};

export default React.memo(StudentsTable);
