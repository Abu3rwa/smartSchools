import { HiOutlineSearch } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const StandardsGradebookFilters = ({
  filters,
  onFilterChange,
  filterOptions,
}) => {
  const { t } = useTranslation(['standardsGradebook']);

  return (
    <section className="standards-controls" aria-label={t('standardsGradebook:filters.title')}>
      <div className="standards-controls__search">
        <HiOutlineSearch aria-hidden="true" />
        <input
          type="search"
          aria-label={t('standardsGradebook:filters.searchPlaceholder')}
          value={filters.search}
          onChange={(event) => onFilterChange('search', event.target.value)}
          placeholder={t('standardsGradebook:filters.searchPlaceholder')}
        />
      </div>

      <select
        aria-label={t('standardsGradebook:filters.classLabel', 'Class')}
        value={filters.classId}
        onChange={(event) => onFilterChange('classId', event.target.value)}
      >
        <option value="">{t('standardsGradebook:filters.allClasses')}</option>
        {(filterOptions?.classes || []).map((item) => (
          <option key={item._id} value={item._id}>{item.name}</option>
        ))}
      </select>

      <select
        aria-label={t('standardsGradebook:filters.subjectLabel', 'Subject')}
        value={filters.subjectId}
        onChange={(event) => onFilterChange('subjectId', event.target.value)}
      >
        <option value="">{t('standardsGradebook:filters.allSubjects')}</option>
        {(filterOptions?.subjects || []).map((item) => (
          <option key={item._id} value={item._id}>{item.name}</option>
        ))}
      </select>

      <select
        aria-label={t('standardsGradebook:filters.periodLabel', 'Period')}
        value={filters.period || ''}
        onChange={(event) => onFilterChange('period', event.target.value)}
      >
        <option value="">{t('standardsGradebook:filters.currentPeriod', 'Current Period')}</option>
        <option value="semester_1">{t('standardsGradebook:filters.semester1', 'Semester 1')}</option>
        <option value="semester_2">{t('standardsGradebook:filters.semester2', 'Semester 2')}</option>
        <option value="full_year">{t('standardsGradebook:filters.fullYear', 'Full Year')}</option>
      </select>
    </section>
  );
};

export default StandardsGradebookFilters;
