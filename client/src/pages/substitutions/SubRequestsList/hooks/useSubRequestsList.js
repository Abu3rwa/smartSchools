import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchSubAnalyticsThunk,
  fetchSubRequestsThunk,
  selectList,
  selectSubAnalytics
} from '../../../../store/slices/substitutionsSlice';
import { fetchTeachers, selectTeachers, selectTeachersLoading } from '../../../../store/slices/teacherSlice';
import { fetchDepartments, selectDepartments } from '../../../../store/slices/departmentSlice';
import { selectUser } from '../../../../store/slices/authSlice';
import { DEFAULT_FILTERS } from '../constants';

const useSubRequestsList = () => {
  const dispatch = useDispatch();
  const { loading, error, items } = useSelector(selectList);
  const analytics = useSelector(selectSubAnalytics);
  const teachers = useSelector(selectTeachers);
  const departments = useSelector(selectDepartments);
  const teachersLoading = useSelector(selectTeachersLoading);
  const user = useSelector(selectUser);
  const canCreate = user?.role === 'admin' || user?.role === 'department_principal';
  const canChangeDepartment = user?.role === 'admin';

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [analyticsFilters, setAnalyticsFilters] = useState({
    coverageType: 'ALL',
    departmentId: ''
  });

  useEffect(() => {
    if (canCreate) {
      dispatch(fetchTeachers());
      if (user?.role === 'admin') dispatch(fetchDepartments());
    }
  }, [dispatch, canCreate, user?.role]);

  const applyFilters = useCallback(() => {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    if (filters.absentTeacherId) params.absentTeacherId = filters.absentTeacherId;
    if (filters.substituteTeacherId) params.substituteTeacherId = filters.substituteTeacherId;
    params.limit = 50;
    dispatch(fetchSubRequestsThunk(params));
  }, [dispatch, filters]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    if (!canCreate) return;
    const payload = {};
    if (analyticsFilters.coverageType && analyticsFilters.coverageType !== 'ALL') {
      payload.coverageType = analyticsFilters.coverageType;
    }
    if (analyticsFilters.departmentId) {
      payload.departmentId = analyticsFilters.departmentId;
    }
    dispatch(fetchSubAnalyticsThunk(payload));
  }, [dispatch, canCreate, analyticsFilters]);

  const teacherOptions = useMemo(
    () =>
      teachers
        .filter((teacher) => teacher.user)
        .map((teacher) => ({
          id: teacher.user._id,
          name: `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim()
        })),
    [teachers]
  );

  return {
    loading,
    error,
    items,
    filters,
    setFilters,
    applyFilters,
    teacherOptions,
    teachersLoading,
    canCreate,
    analytics,
    analyticsFilters,
    setAnalyticsFilters,
    departments,
    canChangeDepartment
  };
};

export default useSubRequestsList;
