import { HiOutlineSearch } from 'react-icons/hi';

const TeachersFilters = ({ searchTerm, onSearchChange }) => {
    return (
        <div className="search-bar" style={{ maxWidth: 400, marginBottom: 'var(--spacing-xl)' }}>
            <HiOutlineSearch className="search-icon" />
            <input
                type="text"
                placeholder="Search teachers..."
                value={searchTerm}
                onChange={(event) => onSearchChange(event.target.value)}
            />
        </div>
    );
};

export default TeachersFilters;
