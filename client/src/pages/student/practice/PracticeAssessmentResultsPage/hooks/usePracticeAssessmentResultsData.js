import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchMyAssessmentResults,
  selectMyAssessmentResults,
  selectMyAssessmentStandardAverages,
  selectMyAssessmentSummary,
  selectMyAssessmentResultsLoading,
  selectMyAssessmentResultsError,
} from "../../../../../store/slices/practiceSlice.js";
import {
  selectCurrentAcademicYear,
  selectSelectedSemester,
} from "../../../../../store/slices/uiSlice.js";

/**
 * Data and actions for SB Assessment Results page.
 * Preserves Redux fetchMyAssessmentResults, selectors for results, summary, standard averages.
 */
export function usePracticeAssessmentResultsData() {
  const dispatch = useDispatch();
  const academicYear = useSelector(selectCurrentAcademicYear);
  const selectedSemester = useSelector(selectSelectedSemester);
  const items = useSelector(selectMyAssessmentResults);
  const standardAverages = useSelector(selectMyAssessmentStandardAverages);
  const summary = useSelector(selectMyAssessmentSummary);
  const loading = useSelector(selectMyAssessmentResultsLoading);
  const error = useSelector(selectMyAssessmentResultsError);

  useEffect(() => {
    dispatch(
      fetchMyAssessmentResults({ academicYear, semester: selectedSemester }),
    );
  }, [dispatch, academicYear, selectedSemester]);

  const onRefresh = () => {
    dispatch(
      fetchMyAssessmentResults({ academicYear, semester: selectedSemester }),
    );
  };

  return {
    academicYear,
    selectedSemester,
    items,
    standardAverages,
    summary,
    loading,
    error,
    onRefresh,
  };
}
