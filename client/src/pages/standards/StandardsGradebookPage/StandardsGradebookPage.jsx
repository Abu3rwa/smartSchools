import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import StandardsGradebookHeader from './components/StandardsGradebookHeader';
import StandardsGradebookFilters from './components/StandardsGradebookFilters';
import StandardsGradebookMatrix from './components/StandardsGradebookMatrix';
import useStandardsGradebookMatrixData from './hooks/useStandardsGradebookMatrixData';
import api from '../../../config/api';
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

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [availableStandards, setAvailableStandards] = useState([]);
  const [standardsLoading, setStandardsLoading] = useState(false);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignSuccess, setAssignSuccess] = useState('');
  const [standardSearch, setStandardSearch] = useState('');
  const [isStandardMenuOpen, setIsStandardMenuOpen] = useState(false);
  const standardPickerRef = useRef(null);
  const [assignForm, setAssignForm] = useState({
    standardId: '',
    title: '',
    instructions: '',
    notifyParents: true,
    notifyStudents: true,
  });

  const selectedClass = useMemo(
    () => (filterOptions?.classes || []).find((item) => String(item._id) === String(filters.classId)),
    [filterOptions?.classes, filters.classId],
  );

  const canAssignStandard = Boolean(filters.classId && filters.subjectId);

  const selectedStandard = useMemo(
    () =>
      availableStandards.find(
        (item) => String(item._id) === String(assignForm.standardId),
      ) || null,
    [availableStandards, assignForm.standardId],
  );

  const filteredStandardOptions = useMemo(() => {
    const query = standardSearch.trim().toLowerCase();
    if (!query) return availableStandards;

    return availableStandards.filter((standard) => {
      const code = String(standard?.code || '').toLowerCase();
      const name = String(standard?.name || '').toLowerCase();
      const description = String(standard?.description || '').toLowerCase();
      return (
        code.includes(query) ||
        name.includes(query) ||
        description.includes(query)
      );
    });
  }, [availableStandards, standardSearch]);

  const loadAssignableStandards = useCallback(async () => {
    if (!canAssignStandard) return;
    setStandardsLoading(true);
    setAssignError('');
    try {
      const params = {
        subject: filters.subjectId,
        limit: 500,
        isActive: true,
      };
      if (selectedClass?.grade != null && selectedClass?.grade !== '') {
        params.gradeLevel = selectedClass.grade;
      }

      const response = await api.get('/standards', { params });
      const standardsFromApi = response?.data?.data?.standards || [];
      setAvailableStandards(standardsFromApi);
    } catch (err) {
      setAssignError(err?.response?.data?.message || t('standardsGradebook:assignStandard.loadError', 'Failed to load standards.'));
    } finally {
      setStandardsLoading(false);
    }
  }, [canAssignStandard, filters.subjectId, selectedClass?.grade, t]);

  const openAssignModal = useCallback(() => {
    if (!canAssignStandard) {
      setAssignError(t('standardsGradebook:assignStandard.selectClassSubjectFirst', 'Please select class and subject first.'));
      return;
    }
    setAssignError('');
    setAssignSuccess('');
    setAssignForm({
      standardId: '',
      title: '',
      instructions: '',
      notifyParents: true,
      notifyStudents: true,
    });
    setStandardSearch('');
    setIsStandardMenuOpen(false);
    setShowAssignModal(true);
  }, [canAssignStandard, t]);

  const closeAssignModal = useCallback(() => {
    if (assignSubmitting) return;
    setIsStandardMenuOpen(false);
    setShowAssignModal(false);
  }, [assignSubmitting]);

  const handleAssignSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (!canAssignStandard) return;
    if (!assignForm.standardId) {
      setAssignError(t('standardsGradebook:assignStandard.standardRequired', 'Please select a standard.'));
      return;
    }

    setAssignSubmitting(true);
    setAssignError('');
    setAssignSuccess('');

    try {
      const semester = filters.period === 'semester_1' ? 1 : filters.period === 'semester_2' ? 2 : null;
      const defaultTitle = selectedStandard?.code
        ? `${selectedStandard.code} Assessment`
        : 'Standards Assessment';

      const payload = {
        standardId: assignForm.standardId,
        classId: filters.classId,
        subjectId: filters.subjectId,
        title: String(assignForm.title || '').trim() || defaultTitle,
        instructions: String(assignForm.instructions || '').trim(),
        notifyParents: assignForm.notifyParents !== false,
        notifyStudents: assignForm.notifyStudents !== false,
        practiceConfig: { sessionType: 'assessment' },
      };
      if (semester) payload.semester = semester;

      await api.post('/standard-assignments', payload);
      setAssignSuccess(t('standardsGradebook:assignStandard.success', 'Standard assigned successfully.'));
      setShowAssignModal(false);
      onRefresh();
    } catch (err) {
      setAssignError(err?.response?.data?.message || t('standardsGradebook:assignStandard.createError', 'Failed to assign standard.'));
    } finally {
      setAssignSubmitting(false);
    }
  }, [
    canAssignStandard,
    assignForm.standardId,
    assignForm.title,
    assignForm.instructions,
    assignForm.notifyParents,
    assignForm.notifyStudents,
    filters.classId,
    filters.subjectId,
    filters.period,
    onRefresh,
    selectedStandard,
    t,
  ]);

  useEffect(() => {
    if (showAssignModal) {
      loadAssignableStandards();
    }
  }, [showAssignModal, loadAssignableStandards]);

  useEffect(() => {
    setStandardSearch('');
    setIsStandardMenuOpen(false);
  }, [filters.classId, filters.subjectId, showAssignModal]);

  useEffect(() => {
    if (!isStandardMenuOpen) return undefined;

    const handleDocumentMouseDown = (event) => {
      if (!standardPickerRef.current?.contains(event.target)) {
        setIsStandardMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, [isStandardMenuOpen]);

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
        <button
          type="button"
          className="gb-toolbar__assign"
          onClick={openAssignModal}
          disabled={!canAssignStandard}
        >
          {t('standardsGradebook:toolbar.assignStandard', '+ Assign Standard')}
        </button>
        <StandardsGradebookHeader onRefresh={onRefresh} loading={loading} />
      </div>

      <section className="gb-teacher-help" aria-label={t('standardsGradebook:teacherHelp.title', 'Teacher Instructions')}>
        <h3>{t('standardsGradebook:teacherHelp.title', 'Teacher Instructions')}</h3>
        <p>{t('standardsGradebook:teacherHelp.steps', '1) Select class and subject. 2) Use + Assign Standard to add missing standards. 3) Enter 1-4 scores in cells. 4) Press Save (Ctrl+S) to store changes.')}</p>
      </section>

      <StandardsGradebookFilters
        filters={filters}
        filterOptions={filterOptions}
        onFilterChange={onFilterChange}
      />

      {error && <div className="standards-gradebook-error">{error}</div>}
      {assignSuccess && <div className="standards-gradebook-success">{assignSuccess}</div>}
      {assignError && !showAssignModal && <div className="standards-gradebook-error">{assignError}</div>}
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

      {showAssignModal && (
        <div className="gb-assign-modal__overlay" onClick={closeAssignModal}>
          <div className="gb-assign-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gb-assign-modal__header">
              <h3>{t('standardsGradebook:assignStandard.title', 'Assign Standard')}</h3>
              <button type="button" onClick={closeAssignModal} disabled={assignSubmitting} aria-label={t('common:close', 'Close')}>×</button>
            </div>

            <form onSubmit={handleAssignSubmit} className="gb-assign-modal__body">
              {assignError && <div className="standards-gradebook-error">{assignError}</div>}

              <label htmlFor="gb-assign-standard-search">{t('standardsGradebook:assignStandard.standard', 'Standard')}</label>
              <div className="gb-standard-picker" ref={standardPickerRef}>
                <button
                  type="button"
                  className="gb-standard-picker__trigger"
                  onClick={() => {
                    if (standardsLoading || assignSubmitting) return;
                    setIsStandardMenuOpen((prev) => !prev);
                  }}
                  disabled={standardsLoading || assignSubmitting}
                  aria-haspopup="listbox"
                  aria-expanded={isStandardMenuOpen}
                >
                  <span
                    className={`gb-standard-picker__trigger-text ${
                      assignForm.standardId ? '' : 'is-placeholder'
                    }`}
                  >
                    {selectedStandard
                      ? selectedStandard.code && (selectedStandard.description || selectedStandard.name)
                        ? `${selectedStandard.code} : ${selectedStandard.description || selectedStandard.name}`
                        : selectedStandard.code || selectedStandard.description || selectedStandard.name || ''
                      : standardsLoading
                        ? t('standardsGradebook:assignStandard.loadingStandards', 'Loading standards...')
                        : t('standardsGradebook:assignStandard.selectStandard', 'Select a standard')}
                  </span>
                </button>

                {isStandardMenuOpen && !standardsLoading && (
                  <div className="gb-standard-picker__menu" role="listbox">
                    <div className="gb-standard-picker__search-wrap">
                      <input
                        id="gb-assign-standard-search"
                        type="text"
                        className="gb-standard-picker__search"
                        value={standardSearch}
                        onChange={(event) => setStandardSearch(event.target.value)}
                        placeholder={t('standardsGradebook:assignStandard.searchStandard', 'Search standards...')}
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setIsStandardMenuOpen(false);
                          }
                        }}
                      />
                    </div>

                    <div className="gb-standard-picker__options">
                      {filteredStandardOptions.length === 0 ? (
                        <div className="gb-standard-picker__empty">
                          {t('standardsGradebook:assignStandard.noMatchingStandards', 'No standards match your search.')}
                        </div>
                      ) : (
                        filteredStandardOptions.map((std) => {
                          const isSelected = String(assignForm.standardId) === String(std._id);
                          return (
                            <button
                              key={std._id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              className={`gb-standard-picker__option ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => {
                                setAssignForm((prev) => ({ ...prev, standardId: std._id }));
                                setIsStandardMenuOpen(false);
                              }}
                            >
                              <span className="gb-standard-picker__option-label">
                                {std.code && (std.description || std.name)
                                  ? `${std.code} : ${std.description || std.name}`
                                  : std.code || std.description || std.name || ''}
                              </span>
                              <span className="gb-standard-picker__option-meta">
                                {std.name || ''}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {selectedStandard?.description && (
                <small
                  className="gb-standard-picker__selected-desc"
                  title={selectedStandard.description}
                >
                  {selectedStandard.description}
                </small>
              )}

              <label htmlFor="gb-assign-title">{t('standardsGradebook:assignStandard.assignmentTitle', 'Assignment title')}</label>
              <input
                id="gb-assign-title"
                type="text"
                value={assignForm.title}
                onChange={(e) => setAssignForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={t('standardsGradebook:assignStandard.assignmentTitlePlaceholder', 'Optional title (auto-generated if empty)')}
                disabled={assignSubmitting}
              />

              <label htmlFor="gb-assign-instructions">{t('standardsGradebook:assignStandard.instructions', 'Instructions')}</label>
              <textarea
                id="gb-assign-instructions"
                rows={3}
                value={assignForm.instructions}
                onChange={(e) => setAssignForm((prev) => ({ ...prev, instructions: e.target.value }))}
                placeholder={t('standardsGradebook:assignStandard.instructionsPlaceholder', 'Optional instructions for students')}
                disabled={assignSubmitting}
              />

              <div className="gb-assign-modal__checks">
                <label>
                  <input
                    type="checkbox"
                    checked={assignForm.notifyParents !== false}
                    onChange={(e) =>
                      setAssignForm((prev) => ({ ...prev, notifyParents: e.target.checked }))
                    }
                    disabled={assignSubmitting}
                  />
                  {t('standardsGradebook:assignStandard.notifyParents', 'Notify parents')}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={assignForm.notifyStudents !== false}
                    onChange={(e) =>
                      setAssignForm((prev) => ({ ...prev, notifyStudents: e.target.checked }))
                    }
                    disabled={assignSubmitting}
                  />
                  {t('standardsGradebook:assignStandard.notifyStudents', 'Notify students')}
                </label>
              </div>

              <div className="gb-assign-modal__footer">
                <button type="button" className="gb-btn--secondary" onClick={closeAssignModal} disabled={assignSubmitting}>
                  {t('common:cancel', 'Cancel')}
                </button>
                <button type="submit" className="gb-btn--primary" disabled={assignSubmitting || standardsLoading}>
                  {assignSubmitting ? t('standardsGradebook:assignStandard.assigning', 'Assigning...') : t('standardsGradebook:assignStandard.assignNow', 'Assign Standard')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StandardsGradebookPage;
