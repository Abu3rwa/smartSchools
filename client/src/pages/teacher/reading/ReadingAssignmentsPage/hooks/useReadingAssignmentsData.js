import { useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  fetchTeacherAssignments,
  fetchAssignmentResults,
  removeAssignment as removeAssignmentThunk,
  clearAssignmentResults,
  selectReadingAssignments,
  selectReadingAssignmentResults,
  selectReadingLoading,
  selectReadingResultsLoading,
  selectReadingError,
} from "../../../../../store/slices/readingSlice.js";
import { selectUser, selectIsAdmin } from "../../../../../store/slices/authSlice.js";
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
  const currentUserId = useSelector(selectUser)?._id || "";
  const isAdmin = useSelector(selectIsAdmin);
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
    canRemoveAssignment: (assignment) => isAdmin
      || String(assignment?.assignedBy?._id || "") === String(currentUserId),
    textFilter,
    openAssignmentId,
    openResults: (assignmentId) => writeParams({ assignment: assignmentId }),
    closeResults: () => writeParams({ assignment: "" }),
    clearTextFilter: () => writeParams({ text: "", assignment: "" }),
    removeAssignment: async (assignmentId) => {
      const result = await dispatch(removeAssignmentThunk(assignmentId));
      return result.meta.requestStatus === "fulfilled";
    },
    onBack: () => navigate("/portal/reading/texts"),
  };
}
