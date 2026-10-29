import { HiOutlineSearch, HiOutlineX } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const STATUS_OPTIONS = [
    { value: 'active', labelKey: 'teachers:filters.status.active' },
    { value: 'inactive', labelKey: 'teachers:filters.status.inactive' },
    { value: 'all', labelKey: 'teachers:filters.status.all' }
];

const TeachersFilters = ({ searchTerm, onSearchChange, totalItems, statusFilter = 'active', onStatusChange }) => {
    const { t } = useTranslation(['teachers']);
    const hasSearch = Boolean(searchTerm.trim());

    return (
        <div className="teachers-toolbar">
            <div className="teachers-search">
                <HiOutlineSearch className="teachers-search-icon" />
                <input
                    type="text"
                    placeholder={t('teachers:filters.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(event) => onSearchChange(event.target.value)}
                />
                {hasSearch && (
                    <button
                        type="button"
                        className="teachers-search-clear"
                        onClick={() => onSearchChange('')}
                        title={t('teachers:filters.clearSearch')}
                        aria-label={t('teachers:filters.clearSearch')}
                    >
                        <HiOutlineX size={16} />
                    </button>
                )}
            </div>
            <div className="teachers-toolbar-right">
                <div className="teachers-segmented" role="tablist">
                    {STATUS_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            role="tab"
                            aria-selected={statusFilter === option.value}
                            className={`teachers-segment ${statusFilter === option.value ? 'is-active' : ''}`}
                            onClick={() => onStatusChange?.(option.value)}
                        >
                            {t(option.labelKey)}
                        </button>
                    ))}
                </div>
                {Number.isFinite(totalItems) && (
                    <span className="teachers-toolbar-count">
                        {t('teachers:table.totalCount', { value: totalItems })}
                    </span>
                )}
            </div>
        </div>
    );
};

export default TeachersFilters;
