import { useTranslation } from 'react-i18next';

const StandardsGradebookFilters = ({
  filters,
  onFilterChange,
  filterOptions,
}) => {
  const { t } = useTranslation(['standardsGradebook']);

  return (
    <section className="standards-gradebook-filters" aria-label={t('standardsGradebook:filters.title')}>
      {/* Period filter */}
      <select value={filters.period || ''} onChange={(event) => onFilterChange('period', event.target.value)}>
        <option value="">{t('standardsGradebook:filters.currentPeriod', 'Current Period')}</option>
        <option value="semester_1">{t('standardsGradebook:filters.semester1', 'Semester 1')}</option>
        <option value="semester_2">{t('standardsGradebook:filters.semester2', 'Semester 2')}</option>
        <option value="full_year">{t('standardsGradebook:filters.fullYear', 'Full Year')}</option>
      </select>

      {/* Class filter */}
      <select value={filters.classId} onChange={(event) => onFilterChange('classId', event.target.value)}>
        <option value="">{t('standardsGradebook:filters.allClasses')}</option>
        {(filterOptions?.classes || []).map((item) => (
          <option key={item._id} value={item._id}>{item.name}</option>
        ))}
      </select>

      {/* Subject filter */}
      <select value={filters.subjectId} onChange={(event) => onFilterChange('subjectId', event.target.value)}>
        <option value="">{t('standardsGradebook:filters.allSubjects')}</option>
        {(filterOptions?.subjects || []).map((item) => (
          <option key={item._id} value={item._id}>{item.name}</option>
        ))}
      </select>

      {/* Text search */}
      <input
        type="search"
        value={filters.search}
        onChange={(event) => onFilterChange('search', event.target.value)}
        placeholder={t('standardsGradebook:filters.searchPlaceholder')}
      />
    </section>
  );
};

export default StandardsGradebookFilters;
