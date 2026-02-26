import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchMyAssessmentResults,
  selectMyAssessmentResults,
  selectMyAssessmentStandardAverages,
  selectMyAssessmentSummary,
  selectMyAssessmentResultsLoading,
  selectMyAssessmentResultsError,
} from "../store/slices/practiceSlice";
import { selectCurrentAcademicYear, selectSelectedSemester } from "../store/slices/uiSlice";
import { HiOutlineArrowLeft, HiOutlineRefresh } from "react-icons/hi";
import "./PracticeAssessmentResultsPage.css";

const PracticeAssessmentResultsPage = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const academicYear = useSelector(selectCurrentAcademicYear);
  const selectedSemester = useSelector(selectSelectedSemester);
  const items = useSelector(selectMyAssessmentResults);
  const standardAverages = useSelector(selectMyAssessmentStandardAverages);
  const summary = useSelector(selectMyAssessmentSummary);
  const loading = useSelector(selectMyAssessmentResultsLoading);
  const error = useSelector(selectMyAssessmentResultsError);

  useEffect(() => {
    dispatch(fetchMyAssessmentResults({ academicYear, semester: selectedSemester }));
  }, [dispatch, academicYear, selectedSemester]);

  return (
    <div className="practice-assessment-results">
      <button className="back-link" onClick={() => navigate("/portal/practice")}>
        <HiOutlineArrowLeft size={16} /> Back to Practice
      </button>

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
          onClick={() => dispatch(fetchMyAssessmentResults({ academicYear, semester: selectedSemester }))}
          disabled={loading}
        >
          <HiOutlineRefresh size={16} />
          <span>{loading ? "Refreshing..." : "Refresh"}</span>
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Assessments</div>
          <div className="stat-value">{summary?.totalAssessments || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Graded</div>
          <div className="stat-value">{summary?.gradedCount || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Average %</div>
          <div className="stat-value">{summary?.averagePercentage || 0}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Average 0-4</div>
          <div className="stat-value">{summary?.averageScale4 || 0}</div>
        </div>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div></div>
      ) : error ? (
        <div className="empty-state">
          <p>{error}</p>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="practice-table">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Standard</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Percent</th>
                  <th>Scale 0-4</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No SB assessment results yet.</td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.assignmentId}>
                      <td>{item.title}</td>
                      <td>
                        {(item.standard?.code || "N/A")}
                        {item.standard?.name ? ` - ${item.standard.name}` : ""}
                      </td>
                      <td>{(item.status || "not_started").replace("_", " ")}</td>
                      <td>
                        {item.score !== null && item.score !== undefined
                          ? `${item.score}/${item.maxScore}`
                          : "—"}
                      </td>
                      <td>
                        {item.percentage !== null && item.percentage !== undefined
                          ? `${item.percentage}%`
                          : "—"}
                      </td>
                      <td>
                        {item.scale4 !== null && item.scale4 !== undefined
                          ? item.scale4
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="table-container" style={{ marginTop: "var(--spacing-lg)" }}>
            <h3>Per-Standard Semester Averages</h3>
            <table className="practice-table">
              <thead>
                <tr>
                  <th>Standard</th>
                  <th>Assessments</th>
                  <th>Average %</th>
                  <th>Average 0-4</th>
                </tr>
              </thead>
              <tbody>
                {standardAverages.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No graded standards yet.</td>
                  </tr>
                ) : (
                  standardAverages.map((item) => (
                    <tr key={item.standardId}>
                      <td>{item.standardCode} - {item.standardName}</td>
                      <td>{item.totalAssessments}</td>
                      <td>{item.averagePercentage}%</td>
                      <td>{item.averageScale4}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default PracticeAssessmentResultsPage;
