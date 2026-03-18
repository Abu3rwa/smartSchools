import { useTranslation } from 'react-i18next';

const StandardAssignFiltersBar = ({ filters, onFilterChange, options }) => {
    const { t } = useTranslation(['standardAssign']);

    if (!options) return null;

    return (
        <div className="assign-filters-bar">
            <div className="assign-filter-group">
                <label htmlFor="filter-class">{t('standardAssign:filters.class', 'Class')}</label>
                <select
                    id="filter-class"
                    value={filters.classId}
                    onChange={(e) => onFilterChange('classId', e.target.value)}
                >
                    <option value="">{t('standardAssign:filters.all', 'All')}</option>
                    {options.classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            <div className="assign-filter-group">
                <label htmlFor="filter-subject">{t('standardAssign:filters.subject', 'Subject')}</label>
                <select
                    id="filter-subject"
                    value={filters.subjectId}
                    onChange={(e) => onFilterChange('subjectId', e.target.value)}
                >
                    <option value="">{t('standardAssign:filters.all', 'All')}</option>
                    {options.subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
            </div>

            <div className="assign-filter-group">
                <label htmlFor="filter-semester">{t('standardAssign:filters.semester', 'Semester')}</label>
                <select
                    id="filter-semester"
                    value={filters.semester}
                    onChange={(e) => onFilterChange('semester', e.target.value)}
                >
                    <option value="">{t('standardAssign:filters.all', 'All')}</option>
                    {options.semesters.map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </div>

            <div className="assign-filter-group">
                <label htmlFor="filter-academic-year">{t('standardAssign:filters.academicYear', 'Academic Year')}</label>
                <select
                    id="filter-academic-year"
                    value={filters.academicYear}
                    onChange={(e) => onFilterChange('academicYear', e.target.value)}
                >
                    <option value="">{t('standardAssign:filters.all', 'All')}</option>
                    {options.academicYears.map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default StandardAssignFiltersBar;
