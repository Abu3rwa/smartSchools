import { usePracticeAssessmentResultsData } from "./hooks/usePracticeAssessmentResultsData.js";
import PracticeAssessmentResultsBackLink from "./components/PracticeAssessmentResultsBackLink.jsx";
import PracticeAssessmentResultsHeader from "./components/PracticeAssessmentResultsHeader.jsx";
import PracticeAssessmentResultsStatsRow from "./components/PracticeAssessmentResultsStatsRow.jsx";
import PracticeAssessmentResultsTable from "./components/PracticeAssessmentResultsTable.jsx";
import PracticeAssessmentResultsStandardAveragesTable from "./components/PracticeAssessmentResultsStandardAveragesTable.jsx";
import PracticeAssessmentResultsLoadingState from "./components/PracticeAssessmentResultsLoadingState.jsx";
import PracticeAssessmentResultsErrorState from "./components/PracticeAssessmentResultsErrorState.jsx";
import "./PracticeAssessmentResultsPage.css";

/**
 * SB Assessment Results page. Student role only. Route: /portal/practice/sb-results.
 */
export default function PracticeAssessmentResultsPage() {
  const {
    academicYear,
    selectedSemester,
    items,
    standardAverages,
    summary,
    loading,
    error,
    onRefresh,
  } = usePracticeAssessmentResultsData();

  return (
    <div className="practice-assessment-results">
      <PracticeAssessmentResultsBackLink />

      <PracticeAssessmentResultsHeader
        academicYear={academicYear}
        selectedSemester={selectedSemester}
        loading={loading}
        onRefresh={onRefresh}
      />

      <PracticeAssessmentResultsStatsRow summary={summary} />

      {loading ? (
        <PracticeAssessmentResultsLoadingState />
      ) : error ? (
        <PracticeAssessmentResultsErrorState error={error} />
      ) : (
        <>
          <PracticeAssessmentResultsTable items={items} />
          <PracticeAssessmentResultsStandardAveragesTable
            standardAverages={standardAverages}
          />
        </>
      )}
    </div>
  );
}
