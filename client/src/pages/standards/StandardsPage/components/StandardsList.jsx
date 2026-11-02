import {
    HiOutlineClipboardList,
    HiOutlinePencil,
    HiOutlineTrash
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import LoadingState from './LoadingState';

const StandardsList = ({
    loading,
    filteredStandards,
    isAdmin,
    onEdit,
    onDelete,
    selectedStandardIds = [],
    onSelectedStandardIdsChange,
    onBulkDelete,
    bulkDeleting = false,
    hasActiveFilters = false,
    onClearFilters
}) => {
    const { t } = useTranslation(['standards']);
    const selectedSet = new Set(selectedStandardIds.map(String));
    const visibleIds = filteredStandards.map((standard) => String(standard._id));
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

    const toggleStandard = (id) => {
        const idString = String(id);
        onSelectedStandardIdsChange(selectedSet.has(idString)
            ? selectedStandardIds.filter((selectedId) => String(selectedId) !== idString)
            : [...selectedStandardIds, idString]);
    };

    const toggleAllVisible = () => {
        onSelectedStandardIdsChange(allVisibleSelected
            ? selectedStandardIds.filter((id) => !visibleIds.includes(String(id)))
            : [...new Set([...selectedStandardIds.map(String), ...visibleIds])]);
    };
    const bulkActions = isAdmin && selectedStandardIds.length > 0 && (
        <div className="standards-bulk-actions">
            <span>{t('standards:list.selectedCount', { count: selectedStandardIds.length })}</span>
            <button type="button" className="btn btn-danger" onClick={onBulkDelete} disabled={bulkDeleting}>
                <HiOutlineTrash />
                {t(bulkDeleting ? 'standards:toasts.deletingBulk' : 'standards:actions.deleteSelected')}
            </button>
        </div>
    );

    if (loading) {
        return <LoadingState />;
    }

    if (filteredStandards.length === 0) {
        return (
            <>
                {bulkActions}
                <div className="standards-empty">
                    <HiOutlineClipboardList size={48} aria-hidden="true" />
                    <p>{t(hasActiveFilters ? 'standards:list.emptyFiltered' : 'standards:list.empty')}</p>
                    {hasActiveFilters ? (
                        <button type="button" className="btn btn-secondary" onClick={onClearFilters}>
                            {t('standards:filters.clear')}
                        </button>
                    ) : (
                        isAdmin && (
                            <p className="standards-empty__hint">
                                {t('standards:list.emptyAdminHint')}
                            </p>
                        )
                    )}
                </div>
            </>
        );
    }

    return (
        <>
            {bulkActions}
            <div className="standards-table">
                <table aria-label={t('standards:list.tableLabel')}>
                <thead>
                    <tr>
                        {isAdmin && (
                            <th scope="col" className="standards-table__check-col">
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={toggleAllVisible}
                                    aria-label={t('standards:list.selectAll')}
                                />
                            </th>
                        )}
                        <th scope="col">{t('standards:list.columns.code')}</th>
                        <th scope="col">{t('standards:list.columns.name')}</th>
                        <th scope="col">{t('standards:list.columns.subjectGrade')}</th>
                        <th scope="col">{t('standards:list.columns.mastery')}</th>
                        {isAdmin && <th scope="col">{t('standards:list.columns.actions')}</th>}
                    </tr>
                </thead>
                <tbody>
                    {filteredStandards.map((standard) => (
                        <tr key={standard._id}>
                            {isAdmin && (
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={selectedSet.has(String(standard._id))}
                                        onChange={() => toggleStandard(standard._id)}
                                        aria-label={t('standards:list.selectStandard', { code: standard.code })}
                                    />
                                </td>
                            )}
                            <td className="standard-code">{standard.code}</td>
                            <td>
                                <div className="standards-table__standard">
                                    <span className="standards-table__name">{standard.name}</span>
                                    {standard.description ? (
                                        <span className="standards-table__desc" title={standard.description}>
                                            {standard.description}
                                        </span>
                                    ) : null}
                                </div>
                            </td>
                            <td>
                                <div className="standards-meta-cell">
                                    <span>{standard.subject?.name || t('standards:common.empty')}</span>
                                    <span className="standards-meta-cell__sub">
                                        {t('standards:filters.grade', { grade: standard.gradeLevel })}
                                        {standard.category ? ` · ${standard.category}` : ''}
                                    </span>
                                </div>
                            </td>
                            <td>
                                <span className="standards-pill">
                                    {t('standards:list.masteryValue', {
                                        threshold: standard.masteryThreshold,
                                        questions: standard.masteryMinQuestions
                                    })}
                                </span>
                            </td>
                            {isAdmin && (
                                <td>
                                    <div className="standard-actions">
                                        <button
                                            type="button"
                                            className="btn-icon"
                                            onClick={() => onEdit(standard)}
                                            title={t('standards:actions.edit')}
                                            aria-label={`${t('standards:actions.edit')} ${standard.code}`}
                                        >
                                            <HiOutlinePencil aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-icon text-danger"
                                            onClick={() => onDelete(standard._id)}
                                            title={t('standards:actions.delete')}
                                            aria-label={`${t('standards:actions.delete')} ${standard.code}`}
                                        >
                                            <HiOutlineTrash aria-hidden="true" />
                                        </button>
                                    </div>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
                </table>
            </div>
        </>
    );
};

export default StandardsList;
