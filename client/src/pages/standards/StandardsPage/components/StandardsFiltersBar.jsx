import { HiOutlineSearch } from 'react-icons/hi';
import { GRADE_LEVEL_OPTIONS } from '../constants';

const StandardsFiltersBar = ({
    searchTerm,
    onSearchTermChange,
    filterSubject,
    onFilterSubjectChange,
    filterGrade,
    onFilterGradeChange,
    subjects
}) => {
    return (
        <div className="filters-bar">
            <div className="search-bar">
                <HiOutlineSearch className="search-icon" />
                <input
                    type="text"
                    placeholder="Search standards..."
                    value={searchTerm}
                    onChange={(event) => onSearchTermChange(event.target.value)}
                />
            </div>
            <select value={filterSubject} onChange={(event) => onFilterSubjectChange(event.target.value)}>
                <option value="">All Subjects</option>
                {subjects.map((subject) => (
                    <option key={subject._id} value={subject._id}>
                        {subject.name}
                    </option>
                ))}
            </select>
            <select value={filterGrade} onChange={(event) => onFilterGradeChange(event.target.value)}>
                <option value="">All Grades</option>
                {GRADE_LEVEL_OPTIONS.map((grade) => (
                    <option key={grade} value={grade}>
                        Grade {grade}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default StandardsFiltersBar;
