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
    bulkDeleting = false
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
                    <HiOutlineClipboardList size={48} />
                    <p>{t('standards:list.empty')}</p>
                    {isAdmin && (
                        <p style={{ fontSize: '0.85rem' }}>
                            {t('standards:list.emptyAdminHint')}
                        </p>
                    )}
                </div>
            </>
        );
    }

    return (
        <>
            {bulkActions}
            <div className="standards-table">
                <table>
                <thead>
                    <tr>
                        {isAdmin && (
                            <th>
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={toggleAllVisible}
                                    aria-label={t('standards:list.selectAll')}
                                />
                            </th>
                        )}
                        <th>{t('standards:list.columns.code')}</th>
                        <th>{t('standards:list.columns.name')}</th>
                        <th>{t('standards:list.columns.description')}</th>
                        <th>{t('standards:list.columns.subject')}</th>
                        <th>{t('standards:list.columns.grade')}</th>
                        <th>{t('standards:list.columns.category')}</th>
                        <th>{t('standards:list.columns.mastery')}</th>
                        {isAdmin && <th>{t('standards:list.columns.actions')}</th>}
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
                            <td>{standard.name}</td>
                            <td className="standard-description" title={standard.description}>
                                {standard.description}
                            </td>
                            <td>{standard.subject?.name || t('standards:common.empty')}</td>
                            <td>{standard.gradeLevel}</td>
                            <td>{standard.category || t('standards:common.empty')}</td>
                            <td>
                                {t('standards:list.masteryValue', {
                                    threshold: standard.masteryThreshold,
                                    questions: standard.masteryMinQuestions
                                })}
                            </td>
                            {isAdmin && (
                                <td>
                                    <div className="standard-actions">
                                        <button
                                            className="btn-icon"
                                            onClick={() => onEdit(standard)}
                                            title={t('standards:actions.edit')}
                                        >
                                            <HiOutlinePencil />
                                        </button>
                                        <button
                                            className="btn-icon text-danger"
                                            onClick={() => onDelete(standard._id)}
                                            title={t('standards:actions.delete')}
                                        >
                                            <HiOutlineTrash />
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
