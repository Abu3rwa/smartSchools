import {
    HiOutlineAcademicCap,
    HiOutlineBookOpen,
    HiOutlineCalendar,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineEye,
    HiOutlinePencilAlt,
    HiOutlineTrash,
    HiOutlineUserGroup,
    HiDotsVertical
} from 'react-icons/hi';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import LoadingState from './LoadingState';
import { formatStandardLabel } from '../../../../utils/standardLabel';

const StandardAssignList = ({
    loading,
    assignments,
    academicYear,
    selectedSemester,
    isAdmin,
    user,
    onViewProgress,
    onEdit,
    onManageQuestionPool,
    onViewAssessmentGradebook,
    onDelete,
    onReviewQuestionPool,
    onApproveQuestionPool,
    onPublishQuestionPool,
    canApproveQuestionPool,
    isTeacher,
    poolActionLoadingId,
    getStandardDescription
}) => {
    const { t, i18n } = useTranslation(['standardAssign']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : undefined;
    const pageSizeOptions = [10, 25, 50];
    const [pageSize, setPageSize] = useState(10);
    const [page, setPage] = useState(1);
    const [openMenuId, setOpenMenuId] = useState(null);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleMenu = (id, event) => {
        event.stopPropagation();
        setOpenMenuId(openMenuId === id ? null : id);
    };

    const getWorkflowStatusLabel = (status = '') => {
        const normalized = String(status || '').toLowerCase();
        return t(`standardAssign:workflowStatus.${normalized}`, { defaultValue: normalized });
    };

    const getSessionModeLabel = (sessionType = '') =>
        sessionType === 'assessment'
            ? t('standardAssign:modes.gradedAssessment')
            : t('standardAssign:modes.practice');

    const getDueDateState = (dueDate) => {
        if (!dueDate) return 'no_due';
        const now = new Date();
        const due = new Date(dueDate);
        if (Number.isNaN(due.getTime())) return 'no_due';
        if (due < now) return 'overdue';
        const days = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (days <= 7) return 'due_soon';
        return 'scheduled';
    };

    const getDueDateStateLabel = (state) => {
        if (state === 'overdue') return t('standardAssign:list.dueOverdue', 'Overdue');
        if (state === 'due_soon') return t('standardAssign:list.dueSoon', 'Due Soon');
        if (state === 'scheduled') return t('standardAssign:list.dueScheduled', 'Scheduled');
        return t('standardAssign:list.noDueDate', 'No Due Date');
    };

    const totalItems = assignments.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => {
        setPage(1);
    }, [pageSize, totalItems]);

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const pagedAssignments = useMemo(() => {
        const start = (page - 1) * pageSize;
        return assignments.slice(start, start + pageSize);
    }, [assignments, page, pageSize]);

    if (loading && !assignments.length) {
        return (
            <section className="assign-table-shell" aria-live="polite" aria-busy="true">
                <div className="assign-table-loading">
                    <LoadingState />
                </div>
            </section>
        );
    }

    if (assignments.length === 0) {
        return (
            <section className="assign-table-shell">
                <div className="assign-table-empty">
                    <HiOutlineAcademicCap size={40} />
                    <p>{t('standardAssign:list.emptyTitle')}</p>
                    <p>{t('standardAssign:list.emptyDescription')}</p>
                </div>
            </section>
        );
    }

    return (
        <section className="assign-table-shell" aria-label={t('standardAssign:list.title', 'Assignments table')}>
            <div className="assign-table-wrap">
                <table className="assign-table" role="table">
                    <thead>
                        <tr>
                            <th>{t('standardAssign:list.assignmentTitle', 'Assignment Title')}</th>
                            <th>{t('standardAssign:list.standard', 'Standard')}</th>
                            <th>{t('standardAssign:list.subject', 'Subject')}</th>
                            <th>{t('standardAssign:list.class', 'Class')}</th>
                            <th>{t('standardAssign:list.mode', 'Mode')}</th>
                            <th>{t('standardAssign:list.poolSize', 'Pool Size')}</th>
                            <th>{t('standardAssign:list.workflowStatus', 'Workflow Status')}</th>
                            <th style={{ width: '60px', textAlign: 'center' }}>{t('standardAssign:list.actions', 'Actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pagedAssignments.map((assignment) => {
                            const isOwner = isAdmin ||
                                assignment.teacher?.user?._id === user?._id ||
                                assignment.teacher?.user === user?._id;
                            const isAssessment = assignment.practiceConfig?.sessionType === 'assessment';
                            const workflowStatus = String(assignment.questionWorkflow?.status || '').toLowerCase();
                            const dueState = getDueDateState(assignment.dueDate);
                            const dueLabel = getDueDateStateLabel(dueState);
                            const standardDescription = getStandardDescription(assignment.standard);

                            return (
                                <tr key={assignment._id}>
                                    <td>
                                        <div className="assign-table__title">
                                            <strong>
                                                {assignment.title || t('standardAssign:list.defaultAssignmentTitle', {
                                                    code: assignment.standard?.code
                                                })}
                                            </strong>
                                            {user?.role === 'teacher' &&
                                                assignment.teacher?.user?._id !== user?._id &&
                                                assignment.teacher?.user !== user?._id && (
                                                    <span className="assign-chip assign-chip--info">
                                                        {t('standardAssign:list.adminAssigned')}
                                                    </span>
                                                )}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="assign-table__standard" title={standardDescription}>
                                            <span className="assign-table__standard-code">
                                                {formatStandardLabel(assignment.standard) || assignment.standard?.code}
                                            </span>
                                            {/* <span className="assign-table__standard-desc">{standardDescription}</span> */}
                                        </div>
                                    </td>
                                    <td>{assignment.subject?.name || '-'}</td>
                                    <td>{assignment.class?.name || t('standardAssign:common.class')}</td>
                                    <td>
                                        <span className={`assign-chip ${isAssessment ? 'assign-chip--assessment' : 'assign-chip--practice'}`}>
                                            {getSessionModeLabel(assignment.practiceConfig?.sessionType)}
                                        </span>
                                    </td>
                                    <td>{assignment.questionWorkflow?.preGeneratedQuestionCount || 0}</td>
                                    <td>
                                        <span className={`assign-chip assign-chip--workflow-${workflowStatus || 'none'}`}>
                                            {getWorkflowStatusLabel(workflowStatus || 'none')}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center', position: 'relative' }}>
                                        <button 
                                            className="btn btn-secondary btn-sm btn-icon" 
                                            onClick={(e) => toggleMenu(assignment._id, e)}
                                            aria-label={t('standardAssign:list.rowActions', 'Row actions')}
                                            aria-expanded={openMenuId === assignment._id}
                                            aria-haspopup="menu"
                                        >
                                            <HiDotsVertical size={16} />
                                        </button>
                                        
                                        {openMenuId === assignment._id && (
                                            <div className="assign-row-menu" ref={menuRef} role="menu">
                                                <div className="assign-row-menu__info">
                                                    <div className="assign-row-menu__info-item">
                                                        <span className="label">{t('standardAssign:list.academicYear', 'Year')}:</span>
                                                        <span className="value">{assignment.academicYear || academicYear}</span>
                                                    </div>
                                                    <div className="assign-row-menu__info-item">
                                                        <span className="label">{t('standardAssign:list.semester', 'Semester')}:</span>
                                                        <span className="value">{assignment.semester || selectedSemester || 1}</span>
                                                    </div>
                                                    <div className="assign-row-menu__info-item">
                                                        <span className="label">{t('standardAssign:list.dueDate', 'Due Date')}:</span>
                                                        <div className="value due-date">
                                                            {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString(locale) : '-'}
                                                            {assignment.dueDate && <span className={`assign-chip assign-chip--${dueState} assign-chip--xs`} style={{marginLeft: 4}}>{dueLabel}</span>}
                                                        </div>
                                                    </div>
                                                    <div className="assign-row-menu__info-item">
                                                        <span className="label">{t('standardAssign:list.students', 'Students')}:</span>
                                                        <span className="value" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                            <HiOutlineUserGroup size={12} />
                                                            {assignment.students?.length || t('standardAssign:common.all')}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="assign-row-menu__actions">
                                                    <button
                                                        className="assign-row-menu__btn"
                                                        onClick={() => { setOpenMenuId(null); onViewProgress(assignment._id); }}
                                                        role="menuitem"
                                                    >
                                                        <HiOutlineEye size={16} /> {t('standardAssign:actions.viewProgress')}
                                                    </button>
                                                    {isOwner && (
                                                        <button
                                                            className="assign-row-menu__btn"
                                                            onClick={() => { setOpenMenuId(null); onEdit(assignment); }}
                                                            role="menuitem"
                                                        >
                                                            <HiOutlinePencilAlt size={16} /> {t('standardAssign:actions.edit')}
                                                        </button>
                                                    )}
                                                    {isOwner && isAssessment && (
                                                        <button
                                                            className="assign-row-menu__btn"
                                                            onClick={() => { setOpenMenuId(null); onManageQuestionPool(assignment._id); }}
                                                            role="menuitem"
                                                        >
                                                            <HiOutlinePencilAlt size={16} /> {t('standardAssign:actions.questionPool')}
                                                        </button>
                                                    )}
                                                    {isTeacher && isAssessment && workflowStatus === 'draft' && (
                                                        <button
                                                            className="assign-row-menu__btn"
                                                            onClick={() => { setOpenMenuId(null); onReviewQuestionPool(assignment._id); }}
                                                            disabled={poolActionLoadingId === assignment._id}
                                                            role="menuitem"
                                                        >
                                                            <HiOutlineEye size={16} />
                                                            {poolActionLoadingId === assignment._id
                                                                ? t('standardAssign:actions.reviewing')
                                                                : t('standardAssign:actions.submitReview')}
                                                        </button>
                                                    )}
                                                    {canApproveQuestionPool && isAssessment && workflowStatus === 'reviewed' && (
                                                        <button
                                                            className="assign-row-menu__btn"
                                                            onClick={() => { setOpenMenuId(null); onApproveQuestionPool(assignment._id); }}
                                                            disabled={poolActionLoadingId === assignment._id}
                                                            role="menuitem"
                                                        >
                                                            <HiOutlineEye size={16} />
                                                            {poolActionLoadingId === assignment._id
                                                                ? t('standardAssign:actions.approving')
                                                                : t('standardAssign:actions.approvePool')}
                                                        </button>
                                                    )}
                                                    {canApproveQuestionPool &&
                                                        isAssessment &&
                                                        ['draft', 'reviewed', 'approved'].includes(workflowStatus) && (
                                                        <button
                                                            className="assign-row-menu__btn"
                                                            onClick={() => { setOpenMenuId(null); onPublishQuestionPool(assignment); }}
                                                            disabled={poolActionLoadingId === assignment._id}
                                                            role="menuitem"
                                                        >
                                                            <HiOutlineEye size={16} />
                                                            {poolActionLoadingId === assignment._id
                                                                ? t('standardAssign:actions.publishing')
                                                                : t('standardAssign:actions.publishPool')}
                                                        </button>
                                                    )}
                                                    {isAssessment && (
                                                        <button
                                                            className="assign-row-menu__btn"
                                                            onClick={() => { setOpenMenuId(null); onViewAssessmentGradebook(assignment._id); }}
                                                            role="menuitem"
                                                        >
                                                            <HiOutlineEye size={16} /> {t('standardAssign:actions.sbGradebook')}
                                                        </button>
                                                    )}
                                                    {isOwner && (
                                                        <button
                                                            className="assign-row-menu__btn text-danger"
                                                            onClick={() => { setOpenMenuId(null); onDelete(assignment._id); }}
                                                            role="menuitem"
                                                        >
                                                            <HiOutlineTrash size={16} /> {t('standardAssign:actions.remove', 'Delete')}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <footer className="assign-table-footer" aria-label={t('standardAssign:list.pagination', 'Pagination')}>
                <div className="assign-table-footer__left">
                    <label htmlFor="assign-page-size">{t('standardAssign:list.pageSize', 'Rows per page')}</label>
                    <select
                        id="assign-page-size"
                        value={pageSize}
                        onChange={(event) => setPageSize(Number(event.target.value))}
                    >
                        {pageSizeOptions.map((size) => (
                            <option key={size} value={size}>{size}</option>
                        ))}
                    </select>
                    <span>{t('standardAssign:list.totalItems', { count: totalItems, defaultValue: `${totalItems} total` })}</span>
                </div>

                <div className="assign-table-footer__right">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                        disabled={page <= 1}
                        aria-label={t('standardAssign:list.previousPage', 'Previous page')}
                    >
                        <HiOutlineChevronLeft size={14} /> {t('standardAssign:list.previous', 'Previous')}
                    </button>
                    <span className="assign-table-footer__indicator">
                        {t('standardAssign:list.pageIndicator', {
                            page,
                            totalPages,
                            defaultValue: `Page ${page} of ${totalPages}`
                        })}
                    </span>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={page >= totalPages}
                        aria-label={t('standardAssign:list.nextPage', 'Next page')}
                    >
                        {t('standardAssign:list.next', 'Next')} <HiOutlineChevronRight size={14} />
                    </button>
                </div>
            </footer>
        </section>
    );
};

export default StandardAssignList;
