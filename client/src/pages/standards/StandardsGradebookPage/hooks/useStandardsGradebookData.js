import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  fetchSBGradebook,
  selectSBGradebookError,
  selectSBGradebookFilterOptions,
  selectSBGradebookLoading,
  selectSBGradebookPagination,
  selectSBGradebookRows,
  selectSBGradebookSummary,
} from '../../../../store/slices/standardSlice';
import {
  selectCurrentAcademicYear,
  selectSelectedSemester,
} from '../../../../store/slices/uiSlice';

const INITIAL_FILTERS = {
  classId: '',
  studentId: '',
  subjectId: '',
  standardId: '',
  sessionType: '',
  status: '',
  search: '',
  sortBy: 'lastActivityAt',
  sortOrder: 'desc',
  page: 1,
  limit: 25,
};

const useStandardsGradebookData = () => {
  const dispatch = useDispatch();
  const { t } = useTranslation(['standardsGradebook']);
  const [filters, setFilters] = useState(INITIAL_FILTERS);

  const rows = useSelector(selectSBGradebookRows);
  const summary = useSelector(selectSBGradebookSummary);
  const pagination = useSelector(selectSBGradebookPagination);
  const filterOptions = useSelector(selectSBGradebookFilterOptions);
  const loading = useSelector(selectSBGradebookLoading);
  const error = useSelector(selectSBGradebookError);
  const academicYear = useSelector(selectCurrentAcademicYear);
  const semester = useSelector(selectSelectedSemester);

  const queryParams = useMemo(() => {
    const params = {
      ...filters,
      academicYear,
      semester,
    };

    Object.keys(params).forEach((key) => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });

    return params;
  }, [filters, academicYear, semester]);

  const queryFingerprint = useMemo(() => JSON.stringify(queryParams), [queryParams]);

  useEffect(() => {
    dispatch(fetchSBGradebook(queryParams));
  }, [dispatch, queryFingerprint]);

  const onFilterChange = useCallback((key, value) => {
    setFilters((previous) => ({
      ...previous,
      [key]: value,
      page: 1,
    }));
  }, []);

  const onPageChange = useCallback((nextPage, nextLimit) => {
    setFilters((previous) => ({
      ...previous,
      page: nextPage,
      limit: nextLimit || previous.limit,
    }));
  }, []);

  const onRefresh = useCallback(() => {
    dispatch(fetchSBGradebook(queryParams));
  }, [dispatch, queryFingerprint]);

  const errorMessage = error || null;

  return {
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
  };
};

export default useStandardsGradebookData;
