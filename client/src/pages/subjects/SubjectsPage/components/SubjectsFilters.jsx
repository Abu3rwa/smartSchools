import { HiOutlineSearch } from 'react-icons/hi';

const SubjectsFilters = ({ searchTerm, onSearchChange }) => {
    return (
        <div className="search-bar" style={{ maxWidth: 400, marginBottom: 'var(--spacing-xl)' }}>
            <HiOutlineSearch className="search-icon" />
            <input
                type="text"
                placeholder="Search subjects..."
                value={searchTerm}
                onChange={(event) => onSearchChange(event.target.value)}
            />
        </div>
    );
};

export default SubjectsFilters;
