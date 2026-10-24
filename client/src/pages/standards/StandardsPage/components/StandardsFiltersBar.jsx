import { HiOutlineSearch, HiOutlineXCircle } from 'react-icons/hi';
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
    subjects,
    hasActiveFilters = false,
    onClearFilters,
    shownCount = 0,
    totalCount = 0
}) => {
    const { t } = useTranslation(['standards']);

    return (
        <div className="filters-bar">
            <div className="search-bar">
                <HiOutlineSearch className="search-icon" aria-hidden="true" />
                <input
                    type="text"
                    placeholder={t('standards:filters.searchPlaceholder')}
                    aria-label={t('standards:filters.aria.search')}
                    value={searchTerm}
                    onChange={(event) => onSearchTermChange(event.target.value)}
                />
            </div>
            <select
                value={filterSubject}
                aria-label={t('standards:filters.aria.subject')}
                onChange={(event) => onFilterSubjectChange(event.target.value)}
            >
                <option value="">{t('standards:filters.allSubjects')}</option>
                {subjects.map((subject) => (
                    <option key={subject._id} value={subject._id}>
                        {subject.name}
                    </option>
                ))}
            </select>
            <select
                value={filterClass}
                aria-label={t('standards:filters.aria.class')}
                onChange={(event) => onFilterClassChange(event.target.value)}
            >
                <option value="">{t('standards:filters.allClasses', { defaultValue: 'All Classes' })}</option>
                {classes.map((schoolClass) => (
                    <option key={schoolClass._id} value={schoolClass._id}>
                        {schoolClass.name || `${t('standards:filters.grade', { grade: schoolClass.grade })} ${schoolClass.section || ''}`.trim()}
                    </option>
                ))}
            </select>
            <select
                value={filterGrade}
                aria-label={t('standards:filters.aria.grade')}
                onChange={(event) => onFilterGradeChange(event.target.value)}
            >
                <option value="">{t('standards:filters.allGrades')}</option>
                {GRADE_LEVEL_OPTIONS.map((grade) => (
                    <option key={grade} value={grade}>
                        {t('standards:filters.grade', { grade })}
                    </option>
                ))}
            </select>
            {hasActiveFilters && (
                <button type="button" className="btn btn-secondary btn-sm filters-clear" onClick={onClearFilters}>
                    <HiOutlineXCircle aria-hidden="true" />
                    {t('standards:filters.clear')}
                </button>
            )}
            <span className="filters-result-count" aria-live="polite">
                {t('standards:filters.resultCount', { shown: shownCount, total: totalCount })}
            </span>
        </div>
    );
};

export default StandardsFiltersBar;
