import StandardsGradebookHeader from './components/StandardsGradebookHeader';
import StandardsGradebookFilters from './components/StandardsGradebookFilters';
import StandardsGradebookSummary from './components/StandardsGradebookSummary';
import StandardsGradebookTable from './components/StandardsGradebookTable';
import useStandardsGradebookData from './hooks/useStandardsGradebookData';
import './StandardsGradebookPage.css';

const StandardsGradebookPage = () => {
  const {
    t,
    rows,
    summary,
    pagination,
    filterOptions,
    loading,
    errorMessage,
    filters,
    onFilterChange,
    onPageChange,
    onRefresh,
  } = useStandardsGradebookData();

  return (
    <div className="standards-gradebook-page">
      <StandardsGradebookHeader onRefresh={onRefresh} loading={loading} />
      <StandardsGradebookFilters
        filters={filters}
        filterOptions={filterOptions}
        onFilterChange={onFilterChange}
      />
      <StandardsGradebookSummary summary={summary} />

      {errorMessage && <div className="standards-gradebook-error">{errorMessage}</div>}
      {loading && <div className="standards-gradebook-loading">{t('standardsGradebook:table.loading')}</div>}

      {!loading && (
        <StandardsGradebookTable
          rows={rows}
          pagination={pagination}
          filters={filters}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
};

export default StandardsGradebookPage;
