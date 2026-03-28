import { HiOutlineSearch } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { GRADE_LEVEL_OPTIONS } from '../constants';

const StandardsFiltersBar = ({
    searchTerm,
    onSearchTermChange,
    filterClass,
    onFilterClassChange,
    filterSubject,
    onFilterSubjectChange,
    filterGrade,
    onFilterGradeChange,
    classes,
    subjects
}) => {
    const { t } = useTranslation(['standards']);

    return (
        <div className="filters-bar">
            <div className="search-bar">
                <HiOutlineSearch className="search-icon" />
                <input
                    type="text"
                    placeholder={t('standards:filters.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(event) => onSearchTermChange(event.target.value)}
                />
            </div>
            <select value={filterSubject} onChange={(event) => onFilterSubjectChange(event.target.value)}>
                <option value="">{t('standards:filters.allSubjects')}</option>
                {subjects.map((subject) => (
                    <option key={subject._id} value={subject._id}>
                        {subject.name}
                    </option>
                ))}
            </select>
            <select value={filterClass} onChange={(event) => onFilterClassChange(event.target.value)}>
                <option value="">{t('standards:filters.allClasses', { defaultValue: 'All Classes' })}</option>
                {classes.map((schoolClass) => (
                    <option key={schoolClass._id} value={schoolClass._id}>
                        {schoolClass.name || `${t('standards:filters.grade', { grade: schoolClass.grade })} ${schoolClass.section || ''}`.trim()}
                    </option>
                ))}
            </select>
            <select value={filterGrade} onChange={(event) => onFilterGradeChange(event.target.value)}>
                <option value="">{t('standards:filters.allGrades')}</option>
                {GRADE_LEVEL_OPTIONS.map((grade) => (
                    <option key={grade} value={grade}>
                        {t('standards:filters.grade', { grade })}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default StandardsFiltersBar;
