import { HiOutlineRefresh } from "react-icons/hi";

export default function PracticeAssessmentResultsHeader({
  academicYear,
  selectedSemester,
  loading,
  onRefresh,
}) {
  return (
    <div className="page-header">
      <div>
        <h1>SB Assessment Results</h1>
        <p className="text-muted">
          Academic Year {academicYear} · Semester {selectedSemester}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={onRefresh}
        disabled={loading}
      >
        <HiOutlineRefresh size={16} />
        <span>{loading ? "Refreshing..." : "Refresh"}</span>
      </button>
    </div>
  );
}
