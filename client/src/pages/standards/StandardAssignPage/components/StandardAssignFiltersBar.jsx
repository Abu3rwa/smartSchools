import { HiOutlineSearch } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const StandardAssignFiltersBar = ({ filters, onFilterChange, options }) => {
    const { t } = useTranslation(['standardAssign']);

    if (!options) return null;

    return (
        <div className="standards-controls">
            <div className="standards-controls__search">
                <HiOutlineSearch aria-hidden="true" />
                <input
                    type="search"
                    value={filters.search || ''}
                    onChange={(event) => onFilterChange('search', event.target.value)}
                    placeholder={t('standardAssign:filters.searchPlaceholder', 'Search assignments...')}
                    aria-label={t('standardAssign:filters.searchPlaceholder', 'Search assignments...')}
                />
            </div>

            <select
                value={filters.classId}
                aria-label={t('standardAssign:filters.class', 'Class')}
                onChange={(event) => onFilterChange('classId', event.target.value)}
            >
                <option value="">{t('standardAssign:filters.all', 'All')}</option>
                {options.classes.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                ))}
            </select>

            <select
                value={filters.subjectId}
                aria-label={t('standardAssign:filters.subject', 'Subject')}
                onChange={(event) => onFilterChange('subjectId', event.target.value)}
            >
                <option value="">{t('standardAssign:filters.all', 'All')}</option>
                {options.subjects.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                ))}
            </select>

            <select
                value={filters.semester}
                aria-label={t('standardAssign:filters.semester', 'Semester')}
                onChange={(event) => onFilterChange('semester', event.target.value)}
            >
                <option value="">{t('standardAssign:filters.all', 'All')}</option>
                {options.semesters.map((semester) => (
                    <option key={semester} value={semester}>{semester}</option>
                ))}
            </select>

            <select
                value={filters.academicYear}
                aria-label={t('standardAssign:filters.academicYear', 'Academic Year')}
                onChange={(event) => onFilterChange('academicYear', event.target.value)}
            >
                <option value="">{t('standardAssign:filters.all', 'All')}</option>
                {options.academicYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                ))}
            </select>
        </div>
    );
};

export default StandardAssignFiltersBar;
