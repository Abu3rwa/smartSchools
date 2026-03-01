import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchPracticeHistory,
  fetchMyAssignments,
  selectPracticeHistory,
  selectHistoryMastery,
  selectMyAssignments,
  selectPracticeLoading,
  clearPracticeHistory,
} from "../../../../../store/slices/practiceSlice.js";
import {
  selectCurrentAcademicYear,
  selectSelectedSemester,
} from "../../../../../store/slices/uiSlice.js";

/**
 * Data and actions for Practice History page.
 * Preserves Redux fetchPracticeHistory, fetchMyAssignments, clearPracticeHistory, assignment lookup.
 */
export function usePracticeHistoryData() {
  const { assignmentId } = useParams();
  const dispatch = useDispatch();

  const history = useSelector(selectPracticeHistory);
  const mastery = useSelector(selectHistoryMastery);
  const assignments = useSelector(selectMyAssignments);
  const loading = useSelector(selectPracticeLoading);
  const academicYear = useSelector(selectCurrentAcademicYear);
  const selectedSemester = useSelector(selectSelectedSemester);

  const [assignment, setAssignment] = useState(null);

  useEffect(() => {
    if (!assignments.length) {
      dispatch(
        fetchMyAssignments({ academicYear, semester: selectedSemester }),
      );
    }
  }, [dispatch, assignments.length, academicYear, selectedSemester]);

  useEffect(() => {
    if (assignments.length) {
      const found = assignments.find((a) => a._id === assignmentId);
      if (found) {
        setAssignment(found);
        dispatch(
          fetchPracticeHistory({
            standardId: found.standard._id,
            params: { academicYear, semester: selectedSemester },
          }),
        );
      }
    }
    return () => {
      dispatch(clearPracticeHistory());
    };
  }, [dispatch, assignmentId, assignments, academicYear, selectedSemester]);

  return {
    assignmentId,
    assignment,
    history,
    mastery,
    loading,
  };
}
