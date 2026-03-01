import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSubRequestsThunk, selectList } from '../../../../store/slices/substitutionsSlice';
import { fetchTeachers, selectTeachers, selectTeachersLoading } from '../../../../store/slices/teacherSlice';
import { selectUser } from '../../../../store/slices/authSlice';
import { DEFAULT_FILTERS } from '../constants';

const useSubRequestsList = () => {
  const dispatch = useDispatch();
  const { loading, error, items } = useSelector(selectList);
  const teachers = useSelector(selectTeachers);
  const teachersLoading = useSelector(selectTeachersLoading);
  const user = useSelector(selectUser);
  const canCreate = user?.role === 'admin' || user?.role === 'department_principal';

  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  useEffect(() => {
    if (canCreate) dispatch(fetchTeachers());
  }, [dispatch, canCreate]);

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
    canCreate
  };
};

export default useSubRequestsList;
