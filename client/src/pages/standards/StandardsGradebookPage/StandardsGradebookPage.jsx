import { useEffect, useCallback } from 'react';
import StandardsGradebookHeader from './components/StandardsGradebookHeader';
import StandardsGradebookFilters from './components/StandardsGradebookFilters';
import StandardsGradebookMatrix from './components/StandardsGradebookMatrix';
import useStandardsGradebookMatrixData from './hooks/useStandardsGradebookMatrixData';
import './StandardsGradebookPage.css';

const StandardsGradebookPage = () => {
  const {
    t,
    standards,
    students,
    classAverage,
    pagination,
    filterOptions,
    loading,
    saving,
    error,
    filters,
    hasPendingChanges,
    onFilterChange,
    onPageChange,
    onRefresh,
    onCellChange,
    onSave,
    getCellValue,
  } = useStandardsGradebookMatrixData();

  // Ctrl+S keyboard shortcut to save
  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (hasPendingChanges) onSave();
    }
  }, [hasPendingChanges, onSave]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Warn on navigate away with unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (hasPendingChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasPendingChanges]);

  return (
    <div className="standards-gradebook-page">
      {/* Toolbar */}
      <div className="gb-toolbar">
        <button
          type="button"
          className="gb-toolbar__save"
          onClick={onSave}
          disabled={!hasPendingChanges || saving}
        >
          {saving ? t('standardsGradebook:toolbar.saving', 'Saving…') : t('standardsGradebook:toolbar.save', 'Save (Ctrl+S)')}
        </button>
        <StandardsGradebookHeader onRefresh={onRefresh} loading={loading} />
      </div>

      <StandardsGradebookFilters
        filters={filters}
        filterOptions={filterOptions}
        onFilterChange={onFilterChange}
      />

      {error && <div className="standards-gradebook-error">{error}</div>}
      {loading && <div className="standards-gradebook-loading">{t('standardsGradebook:table.loading', 'Loading…')}</div>}

      {!loading && (
        <StandardsGradebookMatrix
          standards={standards}
          students={students}
          classAverage={classAverage}
          pagination={pagination}
          getCellValue={getCellValue}
          onCellChange={onCellChange}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
};

export default StandardsGradebookPage;
