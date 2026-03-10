import { HiOutlineSearch } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const SubjectsFilters = ({ searchTerm, onSearchChange }) => {
    const { t } = useTranslation(['subjects']);

    return (
        <div className="search-bar" style={{ maxWidth: 400, marginBottom: 'var(--spacing-xl)' }}>
            <HiOutlineSearch className="search-icon" />
            <input
                type="text"
                placeholder={t('subjects:filters.searchPlaceholder')}
                value={searchTerm}
                onChange={(event) => onSearchChange(event.target.value)}
            />
        </div>
    );
};

export default SubjectsFilters;
