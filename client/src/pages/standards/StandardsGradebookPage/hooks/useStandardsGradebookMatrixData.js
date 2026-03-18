import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  fetchSBGradebookMatrix,
  saveBulkManualScores,
  selectSBGradebookMatrixStandards,
  selectSBGradebookMatrixStudents,
  selectSBGradebookMatrixData,
  selectSBGradebookMatrixClassAverage,
  selectSBGradebookMatrixPagination,
  selectSBGradebookMatrixFilterOptions,
  selectSBGradebookMatrixLoading,
  selectSBGradebookMatrixError,
  selectBulkSaveLoading,
} from '../../../../store/slices/standardSlice';
import {
  selectCurrentAcademicYear,
} from '../../../../store/slices/uiSlice';

const INITIAL_FILTERS = {
  classId: '',
  subjectId: '',
  search: '',
  period: '', // '' = use global, 'semester_1', 'semester_2', 'full_year'
  page: 1,
  limit: 50,
};

const useStandardsGradebookMatrixData = () => {
  const dispatch = useDispatch();
  const { t } = useTranslation(['standardsGradebook']);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [pendingScores, setPendingScores] = useState({}); // { "studentId|standardId": score }

  const standards = useSelector(selectSBGradebookMatrixStandards);
  const students = useSelector(selectSBGradebookMatrixStudents);
  const matrixData = useSelector(selectSBGradebookMatrixData);
  const classAverage = useSelector(selectSBGradebookMatrixClassAverage);
  const pagination = useSelector(selectSBGradebookMatrixPagination);
  const filterOptions = useSelector(selectSBGradebookMatrixFilterOptions);
  const loading = useSelector(selectSBGradebookMatrixLoading);
  const error = useSelector(selectSBGradebookMatrixError);
  const saving = useSelector(selectBulkSaveLoading);
  const globalAcademicYear = useSelector(selectCurrentAcademicYear);

  const hasPendingChanges = Object.keys(pendingScores).length > 0;

  // Derive semester from period filter
  const derivedParams = useMemo(() => {
    const { period } = filters;
    const academicYear = globalAcademicYear;
    let semester = null;

    if (period === 'semester_1') semester = 1;
    else if (period === 'semester_2') semester = 2;
    // full_year or '' → semester = null (fetch all)

    return { academicYear, semester };
  }, [filters.period, globalAcademicYear]);

  const queryParams = useMemo(() => {
    const params = {
      classId: filters.classId,
      subjectId: filters.subjectId,
      search: filters.search,
      page: filters.page,
      limit: filters.limit,
      academicYear: derivedParams.academicYear,
    };
    if (derivedParams.semester) params.semester = derivedParams.semester;

    // Remove empty values
    Object.keys(params).forEach((key) => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });
    return params;
  }, [filters, derivedParams]);

  const queryFingerprint = useMemo(() => JSON.stringify(queryParams), [queryParams]);

  useEffect(() => {
    if (filters.classId && filters.subjectId) {
      dispatch(fetchSBGradebookMatrix(queryParams));
    }
  }, [dispatch, queryFingerprint]);

  const onFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1,
    }));
  }, []);

  const onPageChange = useCallback((nextPage) => {
    setFilters((prev) => ({ ...prev, page: nextPage }));
  }, []);

  const onRefresh = useCallback(() => {
    if (filters.classId && filters.subjectId) {
      dispatch(fetchSBGradebookMatrix(queryParams));
    }
  }, [dispatch, queryFingerprint, filters.classId, filters.subjectId]);

  // Manual score editing
  const onCellChange = useCallback((studentId, standardId, score) => {
    const key = `${studentId}|${standardId}`;
    setPendingScores((prev) => {
      const next = { ...prev };
      if (score === undefined) {
        delete next[key];
      } else {
        next[key] = score;
      }
      return next;
    });
  }, []);

  const onSave = useCallback(async () => {
    if (!hasPendingChanges) return;

    const scores = Object.entries(pendingScores).map(([key, score]) => {
      const [studentId, standardId] = key.split('|');
      return { studentId, standardId, score };
    });

    const result = await dispatch(saveBulkManualScores({
      classId: filters.classId,
      subjectId: filters.subjectId,
      semester: derivedParams.semester,
      academicYear: derivedParams.academicYear,
      scores,
    }));

    if (!result.error) {
      setPendingScores({});
      // Refresh the matrix
      dispatch(fetchSBGradebookMatrix(queryParams));
    }

    return result;
  }, [dispatch, pendingScores, hasPendingChanges, filters.classId, filters.subjectId, derivedParams, queryParams]);

  // Get effective cell value (pending overrides server data)
  const getCellValue = useCallback((studentId, standardId) => {
    const key = `${studentId}|${standardId}`;
    if (key in pendingScores) {
      return { effectiveScore: pendingScores[key], isPending: true };
    }
    const cell = matrixData?.[studentId]?.[standardId];
    return {
      effectiveScore: cell?.effectiveScore ?? null,
      isManual: cell?.isManual || false,
      percentage: cell?.percentage ?? null,
      hasAutoAssessment: cell?.hasAutoAssessment || false,
      isPending: false,
    };
  }, [matrixData, pendingScores]);

  return {
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
  };
};

export default useStandardsGradebookMatrixData;
