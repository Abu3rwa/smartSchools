import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    HiOutlineBell,
    HiOutlineClipboardCheck,
    HiOutlineExternalLink,
    HiOutlinePencil,
    HiOutlineRefresh,
    HiOutlineTrash,
    HiOutlineUpload,
    HiOutlineDotsVertical
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const AssignmentRowActions = ({
    assignment,
    canCreateAssignments,
    onPublishAssignment,
    onOpenGradePanel,
    onEditAssignment,
    onDeleteAssignment,
    onSendReminder,
    onOpenGoogleFormResults,
    sendingReminder,
    publishingAssignment,
    classroom
}) => {
    const { t } = useTranslation(['assignments']);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });

    useEffect(() => {
        if (!menuOpen) return undefined;

        const handlePointerDown = (event) => {
            if (menuRef.current?.contains(event.target)) return;
            if (buttonRef.current?.contains(event.target)) return;
            setMenuOpen(false);
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };
        const handleScroll = (event) => {
            if (menuRef.current?.contains(event.target)) return;
            setMenuOpen(false);
        };
        const handleResize = () => setMenuOpen(false);

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleResize);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleResize);
        };
    }, [menuOpen]);

    const classroomLinks = classroom?.enabled ? classroom.links || {} : {};
    const classroomLink = classroomLinks[assignment.id];
    const canPostToClassroom = Boolean(classroom?.canUse && classroom?.connection?.connected);
    const canManageAssignment = Boolean(canCreateAssignments);
    const isDraft = assignment.status === 'draft';
    const canGrade = assignment.status === 'published' || assignment.status === 'closed';
    const isPublishing = publishingAssignment === assignment.id;
    const isReminding = sendingReminder === assignment.id;

    const toggleMenu = () => {
        if (menuOpen) {
            setMenuOpen(false);
            return;
        }
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return;
        const estimatedHeight = 330;
        const openUpward = rect.bottom + 6 + estimatedHeight > window.innerHeight;
        setMenuPosition({
            top: openUpward ? Math.max(8, rect.top - estimatedHeight - 6) : rect.bottom + 6,
            right: Math.max(8, window.innerWidth - rect.right)
        });
        setMenuOpen(true);
    };

    const run = (action) => {
        if (!action) return;
        setMenuOpen(false);
        action();
    };

    let primaryAction = null;
    if (canManageAssignment && isDraft) {
        primaryAction = {
            label: isPublishing ? t('assignments:actions.publishing') : t('assignments:actions.publish'),
            onClick: () => onPublishAssignment(assignment.id, assignment.notifyAudience || 'both'),
            disabled: isPublishing
        };
    } else if (canManageAssignment && canGrade) {
        primaryAction = {
            label: assignment.status === 'closed'
                ? t('assignments:rowActions.viewResults')
                : t('assignments:actions.grade'),
            onClick: () => onOpenGradePanel(assignment),
            disabled: false
        };
    }

    const hasMenuContent = canManageAssignment || Boolean(assignment.googleForm?.responderUri)
        || Boolean(classroomLink?.alternateLink) || canPostToClassroom;
    if (!primaryAction && !hasMenuContent) return null;

    const menu = menuOpen ? createPortal(
        <div
            ref={menuRef}
            className="assignments-action-menu"
            style={{ top: `${menuPosition.top}px`, right: `${menuPosition.right}px` }}
            role="menu"
            aria-label={t('assignments:rowActions.menuLabel')}
        >
            {canManageAssignment && (
                <button type="button" role="menuitem" onClick={() => run(() => onEditAssignment(assignment))}>
                    <HiOutlinePencil aria-hidden="true" />
                    {t('assignments:rowActions.edit')}
                </button>
            )}

            {assignment.googleForm?.responderUri
                && assignment.status !== 'draft'
                && canManageAssignment
                && onOpenGoogleFormResults && (
                <button type="button" role="menuitem" onClick={() => run(() => onOpenGoogleFormResults(assignment))}>
                    <HiOutlineClipboardCheck aria-hidden="true" />
                    {t('assignments:googleForms.responses')}
                </button>
            )}

            {classroomLink?.alternateLink && (
                <a
                    href={classroomLink.alternateLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                >
                    <HiOutlineExternalLink aria-hidden="true" />
                    {t('assignments:classroom.open')}
                </a>
            )}

            {canPostToClassroom && canManageAssignment
                && classroomLink?.syncState === 'draft'
                && !classroomLink?.lastErrorCode && (
                <button
                    type="button"
                    role="menuitem"
                    disabled={classroom.busy}
                    onClick={() => run(() => {
                        if (window.confirm(t('assignments:classroom.confirmPublishDraft'))) {
                            classroom.publishAssignment(assignment);
                        }
                    })}
                >
                    <HiOutlineUpload aria-hidden="true" />
                    {t('assignments:classroom.actions.publish')}
                </button>
            )}

            {canPostToClassroom && canManageAssignment
                && (assignment.status === 'draft' || assignment.status === 'published')
                && (!classroomLink || classroomLink.lastErrorCode) && (
                <button
                    type="button"
                    role="menuitem"
                    disabled={classroom.busy}
                    onClick={() => run(() => classroom.postAssignment(assignment, {
                        retry: Boolean(classroomLink)
                    }))}
                >
                    <HiOutlineRefresh aria-hidden="true" />
                    {classroomLink
                        ? t('assignments:classroom.actions.retry')
                        : t('assignments:classroom.actions.post')}
                </button>
            )}

            {canManageAssignment && isDraft && (
                <>
                    <div className="assignments-action-menu__sep" role="separator" />
                    <span className="assignments-action-menu__label">
                        {t('assignments:rowActions.publishAndNotify')}
                    </span>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={isPublishing}
                        onClick={() => run(() => onPublishAssignment(assignment.id, 'both'))}
                    >
                        <HiOutlineUpload aria-hidden="true" />
                        {t('assignments:actions.publishBoth')}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={isPublishing}
                        onClick={() => run(() => onPublishAssignment(assignment.id, 'students'))}
                    >
                        <HiOutlineUpload aria-hidden="true" />
                        {t('assignments:actions.publishStudents')}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={isPublishing}
                        onClick={() => run(() => onPublishAssignment(assignment.id, 'parents'))}
                    >
                        <HiOutlineUpload aria-hidden="true" />
                        {t('assignments:actions.publishParents')}
                    </button>
                </>
            )}

            {canManageAssignment && onSendReminder && assignment.status === 'published' && (
                <>
                    <div className="assignments-action-menu__sep" role="separator" />
                    <span className="assignments-action-menu__label">
                        {isReminding ? t('assignments:actions.sending') : t('assignments:rowActions.sendReminder')}
                    </span>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={isReminding}
                        onClick={() => run(() => onSendReminder(assignment.id, 'both'))}
                    >
                        <HiOutlineBell aria-hidden="true" />
                        {t('assignments:actions.remindBoth')}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={isReminding}
                        onClick={() => run(() => onSendReminder(assignment.id, 'students'))}
                    >
                        <HiOutlineBell aria-hidden="true" />
                        {t('assignments:actions.remindStudents')}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={isReminding}
                        onClick={() => run(() => onSendReminder(assignment.id, 'parents'))}
                    >
                        <HiOutlineBell aria-hidden="true" />
                        {t('assignments:actions.remindParents')}
                    </button>
                </>
            )}

            {canManageAssignment && (
                <>
                    <div className="assignments-action-menu__sep" role="separator" />
                    <button
                        type="button"
                        role="menuitem"
                        className="is-danger"
                        onClick={() => run(() => onDeleteAssignment(assignment))}
                    >
                        <HiOutlineTrash aria-hidden="true" />
                        {t('assignments:rowActions.delete')}
                    </button>
                </>
            )}
        </div>,
        document.body
    ) : null;

    return (
        <div className="assignments-row-actions">
            {primaryAction && (
                <button
                    type="button"
                    className="btn btn-primary btn-sm assignments-row-actions__primary"
                    onClick={primaryAction.onClick}
                    disabled={primaryAction.disabled}
                >
                    {primaryAction.label}
                </button>
            )}
            {hasMenuContent && (
                <button
                    ref={buttonRef}
                    type="button"
                    className="assignments-icon-btn"
                    onClick={toggleMenu}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label={t('assignments:rowActions.more')}
                >
                    <HiOutlineDotsVertical aria-hidden="true" />
                </button>
            )}
            {menu}
        </div>
    );
};

export default AssignmentRowActions;
