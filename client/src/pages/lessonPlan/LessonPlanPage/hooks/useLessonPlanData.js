import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchLessons,
  selectLessons,
  selectLessonsLoading,
} from '../../../../store/slices/lessonSlice.js';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice.js';

/**
 * Fetches classes, subjects, teachers (when admin), and lessons.
 */
export default function useLessonPlanData({
  canFilterAsAdmin,
  selectedSubjectFilter,
  selectedClassFilter,
  selectedTeacherFilter,
  startDateFilter,
  endDateFilter,
}) {
  const dispatch = useDispatch();
  const academicYear = useSelector(selectCurrentAcademicYear);
  const lessons = useSelector(selectLessons);
  const loading = useSelector(selectLessonsLoading);

  useEffect(() => {
    const params = { academicYear };
    if (selectedSubjectFilter) params.subject = selectedSubjectFilter;
    if (canFilterAsAdmin && selectedClassFilter) params.class = selectedClassFilter;
    if (canFilterAsAdmin && selectedTeacherFilter) params.teacher = selectedTeacherFilter;
    if (startDateFilter) params.startDate = startDateFilter;
    if (endDateFilter) params.endDate = endDateFilter;
    dispatch(fetchLessons(params));
  }, [
    dispatch,
    academicYear,
    canFilterAsAdmin,
    selectedSubjectFilter,
    selectedClassFilter,
    selectedTeacherFilter,
    startDateFilter,
    endDateFilter,
  ]);

  return { lessons, loading, academicYear };
}
