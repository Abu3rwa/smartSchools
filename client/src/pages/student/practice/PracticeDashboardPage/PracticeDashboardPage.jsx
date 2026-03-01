import { useNavigate } from "react-router-dom";
import PracticeAssignmentsTable from "./components/PracticeAssignmentsTable";
import PracticeDashboardHeader from "./components/PracticeDashboardHeader";
import PracticeEmptyState from "./components/PracticeEmptyState";
import PracticeErrorState from "./components/PracticeErrorState";
import PracticeLoadingState from "./components/PracticeLoadingState";
import PracticeReviewQueueCard from "./components/PracticeReviewQueueCard";
import PracticeStatsGrid from "./components/PracticeStatsGrid";
import usePracticeDashboardData from "./hooks/usePracticeDashboardData";
import "./PracticeDashboardPage.css";

const PracticeDashboardPage = () => {
  const navigate = useNavigate();
  const {
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
  } = usePracticeDashboardData();

  return (
    <div className="practice-dashboard">
      <PracticeDashboardHeader loading={loading} onRefresh={refreshAssignments} />

      <PracticeStatsGrid
        assignmentsCount={assignments.length}
        masteredCount={mastered.length}
        needsReviewCount={needsReview.length}
        inProgressCount={inProgress.length}
        notStartedCount={notStarted.length}
      />

      <PracticeReviewQueueCard
        reviewFeatureEnabled={reviewFeatureEnabled}
        dueNowCount={dueNowCount}
        reviewQueue={reviewQueue}
        reviewQueueLoading={reviewQueueLoading}
        reviewQueueError={reviewQueueError}
        onRefreshQueue={refreshReviewQueue}
        onStartReview={(task) => task.assignment && navigate(`/portal/practice/${task.assignment?._id || task.assignment}`)}
      />

      {loading ? (
        <PracticeLoadingState />
      ) : error && assignments.length === 0 ? (
        <PracticeErrorState error={error} onRetry={refreshAssignments} />
      ) : assignments.length === 0 ? (
        <PracticeEmptyState />
      ) : (
        <PracticeAssignmentsTable
          assignments={assignments}
          onOpenPractice={(assignmentId) => navigate(`/portal/practice/${assignmentId}`)}
          onOpenHistory={(assignmentId) => navigate(`/portal/practice/${assignmentId}/history`)}
        />
      )}
    </div>
  );
};

export default PracticeDashboardPage;
