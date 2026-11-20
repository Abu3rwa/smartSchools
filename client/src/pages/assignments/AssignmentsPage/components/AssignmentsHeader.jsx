import {
    HiOutlineCalendar,
    HiOutlinePencilAlt,
    HiOutlinePlus,
    HiOutlinePuzzle,
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const AssignmentsHeader = ({
    metrics,
    canCreateAssignments,
    integrationsOpen,
    onCreateAssignment,
    onToggleIntegrations,
    onSortNeedsGrading,
    onSortDueDate,
}) => {
    const { t } = useTranslation(['assignments']);

    const pills = [
        {
            key: 'grading',
            value: metrics?.awaitingGrading ?? 0,
            label: t('assignments:overview.awaitingGrading'),
            icon: HiOutlinePencilAlt,
            tone: 'rose',
            onClick: onSortNeedsGrading,
        },
        {
            key: 'due',
            value: metrics?.dueThisWeek ?? 0,
            label: t('assignments:overview.dueThisWeek'),
            icon: HiOutlineCalendar,
            tone: 'amber',
            onClick: onSortDueDate,
        },
    ];

    return (
        <div className="page-header assignments-page__header">
            <h1>{t('assignments:header.title')}</h1>
            <div className="assignments-page__pills" role="group" aria-label={t('assignments:overview.label')}>
                {pills.map((pill) => {
                    const Icon = pill.icon;
                    const hot = pill.value > 0;
                    return (
                        <button
                            key={pill.key}
                            type="button"
                            className={`assignments-pill${hot ? ` assignments-pill--${pill.tone}` : ''}`}
                            onClick={pill.onClick}
                        >
                            <Icon aria-hidden="true" />
                            <strong>{pill.value}</strong>
                            {pill.label}
                        </button>
                    );
                })}
            </div>
            <div className="assignments-page__header-actions">
                {canCreateAssignments && (
                    <>
                        <button
                            type="button"
                            className={`btn btn-outline${integrationsOpen ? ' is-active' : ''}`}
                            aria-pressed={integrationsOpen}
                            onClick={onToggleIntegrations}
                        >
                            <HiOutlinePuzzle aria-hidden="true" />
                            {t('assignments:header.integrations')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary assignments-page__create"
                            onClick={onCreateAssignment}
                        >
                            <HiOutlinePlus aria-hidden="true" />
                            <span>{t('assignments:actions.createAssignment')}</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default AssignmentsHeader;