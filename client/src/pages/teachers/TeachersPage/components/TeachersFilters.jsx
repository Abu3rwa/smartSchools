import { HiOutlineSearch } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const TeachersFilters = ({ searchTerm, onSearchChange }) => {
    const { t } = useTranslation(['teachers']);

    return (
        <div className="search-bar" style={{ maxWidth: 400, marginBottom: 'var(--spacing-xl)' }}>
            <HiOutlineSearch className="search-icon" />
            <input
                type="text"
                placeholder={t('teachers:filters.searchPlaceholder')}
                value={searchTerm}
                onChange={(event) => onSearchChange(event.target.value)}
            />
        </div>
    );
};

export default TeachersFilters;
