import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import AssignmentsTable from './AssignmentsTable';
import AssignmentsToolbar from './AssignmentsToolbar';
import { getPageNumbers } from '../utils/assignmentListPresentation';

const STATUS_TABS = ['all', 'draft', 'published', 'closed', 'archived'];

const AssignmentsPanel = ({
    assignments,
    rows,
    loading,
    statusCounts,
    selectedStatus,
    onStatusChange,
    sortKey,
    onSortChange,
    searchTerm,
    onSearchChange,
    selectedClass,
    onClassChange,
    availableClasses,
    selectedSubject,
    onSubjectChange,
    availableSubjects,
    filteredCount,
    totalCount,
    page,
    pageCount,
    pageSize,
    onPageChange,
    selectedIds,
    onToggleSelected,
    onToggleSelectAll,
    allVisibleSelected,
    someVisibleSelected,
    onClearSelection,
    onBulkPublish,
    onBulkRemind,
    bulkBusy,
    canCreateAssignments,
    onStartCreate,
    actions
}) => {
    const { t } = useTranslation(['assignments']);
    const selectedAssignments = assignments.filter((assignment) => selectedIds.has(assignment.id));
    const selectedDraftCount = selectedAssignments.filter((assignment) => assignment.status === 'draft').length;
    const selectedPublishedCount = selectedAssignments.filter((assignment) => assignment.status === 'published').length;
    const from = filteredCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, filteredCount);

    const tabs = STATUS_TABS.filter((status) => status !== 'archived' || statusCounts.archived > 0);

    return (
        <section className="assignments-panel" aria-label={t('assignments:table.title')}>
            <div className="assignments-panel__head">
                <div
                    className="assignments-status-tabs"
                    role="group"
                    aria-label={t('assignments:toolbar.filterByStatus')}
                >
                    {tabs.map((status) => (
                        <button
                            key={status}
                            type="button"
                            className={`assignments-status-tab${selectedStatus === status ? ' is-active' : ''}`}
                            aria-pressed={selectedStatus === status}
                            onClick={() => onStatusChange(status)}
                        >
                            {t(`assignments:status.${status}`)}
                            <span className="assignments-status-tab__count">
                                {statusCounts[status] || 0}
                            </span>
                        </button>
                    ))}
                </div>

                <label className="assignments-sort">
                    <span>{t('assignments:toolbar.sortBy')}</span>
                    <select
                        value={sortKey}
                        onChange={(event) => onSortChange(event.target.value)}
                        aria-label={t('assignments:toolbar.sortBy')}
                    >
                        <option value="dueDate">{t('assignments:toolbar.sortDueDate')}</option>
                        <option value="created">{t('assignments:toolbar.sortCreated')}</option>
                        <option value="title">{t('assignments:toolbar.sortTitle')}</option>
                        <option value="needsGrading">{t('assignments:toolbar.sortNeedsGrading')}</option>
                    </select>
                </label>
            </div>

            <AssignmentsToolbar
                searchTerm={searchTerm}
                onSearchChange={onSearchChange}
                selectedClass={selectedClass}
                onClassChange={onClassChange}
                availableClasses={availableClasses}
                selectedSubject={selectedSubject}
                onSubjectChange={onSubjectChange}
                availableSubjects={availableSubjects}
                visibleCount={filteredCount}
                totalCount={totalCount}
            />

            {selectedIds.size > 0 && (
                <div className="assignments-bulkbar">
                    <strong>
                        {t('assignments:toolbar.selected', { count: selectedIds.size })}
                    </strong>
                    {selectedDraftCount > 0 && (
                        <button
                            type="button"
                            className="assignments-bulkbar__button"
                            disabled={Boolean(bulkBusy)}
                            onClick={() => onBulkPublish(selectedAssignments)}
                        >
                            {bulkBusy === 'publish'
                                ? t('assignments:common.saving')
                                : t('assignments:toolbar.publishSelected')}
                        </button>
                    )}
                    {selectedPublishedCount > 0 && (
                        <select
                            className="assignments-bulkbar__select"
                            value=""
                            disabled={Boolean(bulkBusy)}
                            onChange={(event) => {
                                if (!event.target.value) return;
                                onBulkRemind(selectedAssignments, event.target.value);
                            }}
                            aria-label={t('assignments:toolbar.remindSelected')}
                        >
                            <option value="" disabled>
                                {bulkBusy === 'remind'
                                    ? t('assignments:actions.sending')
                                    : t('assignments:toolbar.remindSelected')}
                            </option>
                            <option value="both">{t('assignments:audience.both')}</option>
                            <option value="students">{t('assignments:audience.students')}</option>
                            <option value="parents">{t('assignments:audience.parents')}</option>
                        </select>
                    )}
                    <button
                        type="button"
                        className="assignments-bulkbar__button"
                        onClick={onClearSelection}
                    >
                        {t('assignments:toolbar.clearSelection')}
                    </button>
                </div>
            )}

            <AssignmentsTable
                loading={loading}
                rows={rows}
                canCreateAssignments={canCreateAssignments}
                selectedIds={selectedIds}
                onToggleSelected={onToggleSelected}
                onToggleSelectAll={onToggleSelectAll}
                allVisibleSelected={allVisibleSelected}
                someVisibleSelected={someVisibleSelected}
                onStartCreate={onStartCreate}
                actions={actions}
            />

            {!loading && filteredCount > 0 && (
                <div className="assignments-panel__foot">
                    <span>
                        {t('assignments:pagination.showing', { from, to, total: filteredCount })}
                    </span>
                    {pageCount > 1 && (
                        <nav className="assignments-pager" aria-label={t('assignments:pagination.label')}>
                            <button
                                type="button"
                                onClick={() => onPageChange(page - 1)}
                                disabled={page <= 1}
                                aria-label={t('assignments:pagination.previous')}
                            >
                                <HiOutlineChevronLeft aria-hidden="true" />
                            </button>
                            {getPageNumbers(page, pageCount).map((pageNumber, index) => (
                                typeof pageNumber === 'number' ? (
                                    <button
                                        key={pageNumber}
                                        type="button"
                                        className={pageNumber === page ? 'is-current' : ''}
                                        aria-current={pageNumber === page ? 'page' : undefined}
                                        onClick={() => onPageChange(pageNumber)}
                                    >
                                        {pageNumber}
                                    </button>
                                ) : (
                                    <span className="assignments-pager__ellipsis" key={`${pageNumber}-${index}`}>
                                        …
                                    </span>
                                )
                            ))}
                            <button
                                type="button"
                                onClick={() => onPageChange(page + 1)}
                                disabled={page >= pageCount}
                                aria-label={t('assignments:pagination.next')}
                            >
                                <HiOutlineChevronRight aria-hidden="true" />
                            </button>
                        </nav>
                    )}
                </div>
            )}
        </section>
    );
};

export default AssignmentsPanel;
