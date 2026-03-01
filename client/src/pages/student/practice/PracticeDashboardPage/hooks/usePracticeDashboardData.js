import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchMyAssignments,
  fetchReviewQueue,
  selectMyAssignments,
  selectPracticeAssignmentsLoading,
  selectPracticeError,
  selectReviewFeatureEnabled,
  selectReviewQueue,
  selectReviewQueueError,
  selectReviewQueueLoading,
} from "../../../../../store/slices/practiceSlice";
import { selectCurrentAcademicYear, selectSelectedSemester } from "../../../../../store/slices/uiSlice";
import { REVIEW_QUEUE_LIMIT } from "../constants";
import { buildPracticeBuckets } from "../utils/practiceDashboardPresentation";

const usePracticeDashboardData = () => {
  const dispatch = useDispatch();
  const rawAssignments = useSelector(selectMyAssignments);
  const assignments = rawAssignments.filter((assignment) => assignment.standard);
  const loading = useSelector(selectPracticeAssignmentsLoading);
  const error = useSelector(selectPracticeError);
  const reviewQueue = useSelector(selectReviewQueue);
  const academicYear = useSelector(selectCurrentAcademicYear);
  const selectedSemester = useSelector(selectSelectedSemester);
  const reviewFeatureEnabled = useSelector(selectReviewFeatureEnabled);
  const reviewQueueLoading = useSelector(selectReviewQueueLoading);
  const reviewQueueError = useSelector(selectReviewQueueError);

  useEffect(() => {
    dispatch(fetchMyAssignments({ academicYear, semester: selectedSemester }));
    dispatch(fetchReviewQueue({ limit: REVIEW_QUEUE_LIMIT }));
  }, [dispatch, academicYear, selectedSemester]);

  const refreshAssignments = () => {
    dispatch(fetchMyAssignments({ academicYear, semester: selectedSemester }));
  };

  const refreshReviewQueue = () => {
    dispatch(fetchReviewQueue({ limit: REVIEW_QUEUE_LIMIT }));
  };

  const { mastered, needsReview, inProgress, notStarted } = buildPracticeBuckets(assignments);
  const dueNowCount = reviewQueue.filter((task) => task.status === "scheduled").length;

  return {
    assignments,
    loading,
    error,
    reviewQueue,
    reviewFeatureEnabled,
    reviewQueueLoading,
    reviewQueueError,
    mastered,
    needsReview,
    inProgress,
    notStarted,
    dueNowCount,
    refreshAssignments,
    refreshReviewQueue,
  };
};

export default usePracticeDashboardData;
