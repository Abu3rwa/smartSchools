import { useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  fetchTeacherAssignments,
  fetchAssignmentResults,
  clearAssignmentResults,
  selectReadingAssignments,
  selectReadingAssignmentResults,
  selectReadingLoading,
  selectReadingResultsLoading,
  selectReadingError,
} from "../../../../../store/slices/readingSlice.js";
import { selectCurrentAcademicYear } from "../../../../../store/slices/uiSlice.js";

export function useReadingAssignmentsData() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const assignments = useSelector(selectReadingAssignments) || [];
  const results = useSelector(selectReadingAssignmentResults);
  const loading = useSelector(selectReadingLoading);
  const resultsLoading = useSelector(selectReadingResultsLoading);
  const error = useSelector(selectReadingError);
  const academicYear = useSelector(selectCurrentAcademicYear);
  const textFilter = searchParams.get("text") || "";
  const openAssignmentId = searchParams.get("assignment") || "";

  useEffect(() => {
    dispatch(fetchTeacherAssignments({ academicYear, textId: textFilter || undefined }));
  }, [dispatch, academicYear, textFilter]);

  useEffect(() => {
    if (!openAssignmentId) {
      dispatch(clearAssignmentResults());
      return undefined;
    }
    dispatch(fetchAssignmentResults(openAssignmentId));
    return () => dispatch(clearAssignmentResults());
  }, [dispatch, openAssignmentId]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const writeParams = useCallback((changes) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return {
    assignments,
    results,
    loading,
    resultsLoading,
    academicYear,
    textFilter,
    openAssignmentId,
    openResults: (assignmentId) => writeParams({ assignment: assignmentId }),
    closeResults: () => writeParams({ assignment: "" }),
    clearTextFilter: () => writeParams({ text: "", assignment: "" }),
    onBack: () => navigate("/portal/reading/texts"),
  };
}
