import { useTranslation } from 'react-i18next';

const StandardsGradebookFilters = ({
  filters,
  onFilterChange,
  filterOptions,
}) => {
  const { t } = useTranslation(['standardsGradebook']);

  return (
    <section className="standards-gradebook-filters" aria-label={t('standardsGradebook:filters.title')}>
      <input
        type="search"
        value={filters.search}
        onChange={(event) => onFilterChange('search', event.target.value)}
        placeholder={t('standardsGradebook:filters.searchPlaceholder')}
      />

      <select value={filters.classId} onChange={(event) => onFilterChange('classId', event.target.value)}>
        <option value="">{t('standardsGradebook:filters.allClasses')}</option>
        {(filterOptions?.classes || []).map((item) => (
          <option key={item._id} value={item._id}>{item.name}</option>
        ))}
      </select>

      <select value={filters.subjectId} onChange={(event) => onFilterChange('subjectId', event.target.value)}>
        <option value="">{t('standardsGradebook:filters.allSubjects')}</option>
        {(filterOptions?.subjects || []).map((item) => (
          <option key={item._id} value={item._id}>{item.name}</option>
        ))}
      </select>

      <select value={filters.standardId} onChange={(event) => onFilterChange('standardId', event.target.value)}>
        <option value="">{t('standardsGradebook:filters.allStandards')}</option>
        {(filterOptions?.standards || []).map((item) => (
          <option key={item._id} value={item._id}>{item.code || item.name}</option>
        ))}
      </select>

      <select value={filters.studentId} onChange={(event) => onFilterChange('studentId', event.target.value)}>
        <option value="">{t('standardsGradebook:filters.allStudents')}</option>
        {(filterOptions?.students || []).map((item) => (
          <option key={item._id} value={item._id}>{[item.firstName, item.lastName].filter(Boolean).join(' ')}</option>
        ))}
      </select>

      <select value={filters.status} onChange={(event) => onFilterChange('status', event.target.value)}>
        <option value="">{t('standardsGradebook:filters.allStatuses')}</option>
        {(filterOptions?.statuses || []).map((status) => (
          <option key={status} value={status}>{t(`standardsGradebook:status.${status}`)}</option>
        ))}
      </select>

      <select value={filters.sessionType} onChange={(event) => onFilterChange('sessionType', event.target.value)}>
        <option value="">{t('standardsGradebook:filters.allSessionTypes')}</option>
        <option value="practice">{t('standardsGradebook:sessionType.practice')}</option>
        <option value="assessment">{t('standardsGradebook:sessionType.assessment')}</option>
      </select>
    </section>
  );
};

export default StandardsGradebookFilters;
