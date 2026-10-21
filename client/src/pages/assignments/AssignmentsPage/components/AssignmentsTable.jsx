import { useEffect, useRef } from 'react';
import { HiOutlineClipboardList, HiOutlinePlus } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import AssignmentRowActions from './AssignmentRowActions';
import {
    getAssignmentDuePresentation,
    getAssignmentProgressPresentation
} from '../utils/assignmentListPresentation';

const SkeletonRows = ({ canSelect }) => {
    const columns = canSelect ? 6 : 5;
    return (
        <>
            {[0, 1, 2, 3, 4].map((row) => (
                <tr className="assignments-skeleton-row" key={row} aria-hidden="true">
                    {Array.from({ length: columns }, (_, column) => (
                        <td key={column}>
                            <span className={`assignments-skeleton assignments-skeleton--w${(column % 3) + 1}`} />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
};

const SkeletonCards = () => (
    <div className="assignments-skeleton-cards" aria-hidden="true">
        {[0, 1, 2, 3].map((card) => (
            <div className="assignments-skeleton-card" key={card}>
                <span className="assignments-skeleton assignments-skeleton--w1" />
                <span className="assignments-skeleton assignments-skeleton--w2" />
                <span className="assignments-skeleton assignments-skeleton--w3" />
            </div>
        ))}
    </div>
);

const AssignmentsTable = ({
    loading,
    rows,
    canCreateAssignments,
    selectedIds,
    onToggleSelected,
    onToggleSelectAll,
    allVisibleSelected,
    someVisibleSelected,
    onStartCreate,
    actions
}) => {
    const { t, i18n } = useTranslation(['assignments']);
    const selectAllRef = useRef(null);

    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
        }
    }, [allVisibleSelected, someVisibleSelected]);

    if (loading) {
        return (
            <div className="assignments-table-block" aria-busy="true" aria-label={t('assignments:table.loading')}>
                <div className="assignments-table-wrap">
                    <table className="assignments-table">
                        <thead>
                            <tr>
                                {canCreateAssignments && <th className="assignments-check-cell" />}
                                <th>{t('assignments:table.columns.assignment')}</th>
                                <th>{t('assignments:table.columns.status')}</th>
                                <th>{t('assignments:table.columns.due')}</th>
                                <th>{t('assignments:table.columns.progress')}</th>
                                <th aria-label={t('assignments:table.columns.actions')} />
                            </tr>
                        </thead>
                        <tbody>
                            <SkeletonRows canSelect={canCreateAssignments} />
                        </tbody>
                    </table>
                </div>
                <SkeletonCards />
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="assignments-empty">
                <span className="assignments-empty__icon" aria-hidden="true">
                    <HiOutlineClipboardList />
                </span>
                <h3>{t('assignments:table.emptyTitle')}</h3>
                <p>{t('assignments:table.emptyDescription')}</p>
                {canCreateAssignments && (
                    <button type="button" className="btn btn-primary" onClick={onStartCreate}>
                        <HiOutlinePlus />
                        {t('assignments:actions.createAssignment')}
                    </button>
                )}
            </div>
        );
    }

    const getStatusLabel = (status) => t(`assignments:status.${status}`, { defaultValue: status });
    const getClassroomState = (link) => t(`assignments:classroom.states.${link.syncState}`, {
        defaultValue: link.syncState
    });

    return (
        <div className="assignments-table-block">
            <div className="assignments-table-wrap">
                <table className="assignments-table">
                    <thead>
                        <tr>
                            {canCreateAssignments && (
                                <th className="assignments-check-cell">
                                    <input
                                        ref={selectAllRef}
                                        type="checkbox"
                                        className="assignments-row-check"
                                        checked={allVisibleSelected}
                                        onChange={(event) => onToggleSelectAll(event.target.checked)}
                                        aria-label={t('assignments:toolbar.selectAll')}
                                    />
                                </th>
                            )}
                            <th>{t('assignments:table.columns.assignment')}</th>
                            <th>{t('assignments:table.columns.status')}</th>
                            <th>{t('assignments:table.columns.due')}</th>
                            <th className="assignments-progress-cell">
                                {t('assignments:table.columns.progress')}
                            </th>
                            <th aria-label={t('assignments:table.columns.actions')} />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((assignment) => {
                            const due = getAssignmentDuePresentation(assignment, { language: i18n.language, t });
                            const progress = getAssignmentProgressPresentation(assignment, { language: i18n.language, t });
                            const classroomLink = actions.classroom?.enabled
                                ? actions.classroom.links?.[assignment.id]
                                : null;

                            return (
                                <tr key={assignment.id}>
                                    {canCreateAssignments && (
                                        <td className="assignments-check-cell">
                                            <input
                                                type="checkbox"
                                                className="assignments-row-check"
                                                checked={selectedIds.has(assignment.id)}
                                                onChange={(event) => onToggleSelected(assignment.id, event.target.checked)}
                                                aria-label={t('assignments:toolbar.selectAssignment', {
                                                    title: assignment.title
                                                })}
                                            />
                                        </td>
                                    )}
                                    <td>
                                        <div className="assignments-row-title">{assignment.title}</div>
                                        <div className="assignments-row-meta">
                                            {(assignment.assignmentType?.name || assignment.assignmentType?.key) && (
                                                <span className="assignments-type-chip">
                                                    {assignment.assignmentType?.name || assignment.assignmentType?.key}
                                                </span>
                                            )}
                                            {assignment.class?.name && (
                                                <>
                                                    <span className="assignments-meta-dot" aria-hidden="true" />
                                                    <span>{assignment.class.name}</span>
                                                </>
                                            )}
                                            {assignment.subject?.name && (
                                                <>
                                                    <span className="assignments-meta-dot" aria-hidden="true" />
                                                    <span>{assignment.subject.name}</span>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`assignments-status assignments-status--${assignment.status}`}>
                                            <span className="assignments-status__dot" aria-hidden="true" />
                                            {getStatusLabel(assignment.status)}
                                        </span>
                                        {classroomLink && (
                                            <span
                                                className={`assignments-classroom-badge assignments-classroom-badge--${classroomLink.syncState}`}
                                                title={classroomLink.lastError || undefined}
                                            >
                                                {t('assignments:classroom.badge', {
                                                    state: getClassroomState(classroomLink)
                                                })}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <div className={`assignments-due${due.tone ? ` assignments-due--${due.tone}` : ''}`}>
                                            <span className="assignments-due__main">{due.main}</span>
                                            {due.sub && <span className="assignments-due__sub">{due.sub}</span>}
                                        </div>
                                    </td>
                                    <td className="assignments-progress-cell">
                                        <div className={`assignments-progress assignments-progress--${progress.tone}`}>
                                            <div className="assignments-progress__meta">
                                                <span>{progress.label}</span>
                                                {progress.percentLabel && (
                                                    <span className="assignments-progress__percent">
                                                        {progress.percentLabel}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="assignments-progress__bar" aria-hidden="true">
                                                <span style={{ width: `${progress.percent}%` }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="assignments-actions-cell">
                                        <AssignmentRowActions
                                            assignment={assignment}
                                            {...actions}
                                            classroom={actions.classroom}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="assignments-mobile-list">
                {rows.map((assignment) => {
                    const due = getAssignmentDuePresentation(assignment, { language: i18n.language, t });
                    const progress = getAssignmentProgressPresentation(assignment, { language: i18n.language, t });
                    return (
                        <article className="assignments-mobile-card" key={assignment.id}>
                            <div className="assignments-mobile-card__top">
                                <div className="assignments-mobile-card__heading">
                                    {canCreateAssignments && (
                                        <input
                                            type="checkbox"
                                            className="assignments-row-check"
                                            checked={selectedIds.has(assignment.id)}
                                            onChange={(event) => onToggleSelected(assignment.id, event.target.checked)}
                                            aria-label={t('assignments:toolbar.selectAssignment', {
                                                title: assignment.title
                                            })}
                                        />
                                    )}
                                    <div>
                                        <div className="assignments-row-title">{assignment.title}</div>
                                        <div className="assignments-row-meta">
                                            {(assignment.assignmentType?.name || assignment.assignmentType?.key) && (
                                                <span className="assignments-type-chip">
                                                    {assignment.assignmentType?.name || assignment.assignmentType?.key}
                                                </span>
                                            )}
                                            {assignment.class?.name && (
                                                <>
                                                    <span className="assignments-meta-dot" aria-hidden="true" />
                                                    <span>{assignment.class.name}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <span className={`assignments-status assignments-status--${assignment.status}`}>
                                    <span className="assignments-status__dot" aria-hidden="true" />
                                    {getStatusLabel(assignment.status)}
                                </span>
                            </div>

                            <div className="assignments-mobile-card__meta">
                                <div className={`assignments-due${due.tone ? ` assignments-due--${due.tone}` : ''}`}>
                                    <span className="assignments-due__main">{due.main}</span>
                                    {due.sub && <span className="assignments-due__sub">{due.sub}</span>}
                                </div>
                                <div className={`assignments-progress assignments-progress--${progress.tone}`}>
                                    <div className="assignments-progress__meta">
                                        <span>{progress.label}</span>
                                        {progress.percentLabel && (
                                            <span className="assignments-progress__percent">
                                                {progress.percentLabel}
                                            </span>
                                        )}
                                    </div>
                                    <div className="assignments-progress__bar" aria-hidden="true">
                                        <span style={{ width: `${progress.percent}%` }} />
                                    </div>
                                </div>
                            </div>

                            <AssignmentRowActions
                                assignment={assignment}
                                {...actions}
                                classroom={actions.classroom}
                            />
                        </article>
                    );
                })}
            </div>
        </div>
    );
};

export default AssignmentsTable;
