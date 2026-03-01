export default function PracticeAssessmentResultsStatsRow({ summary }) {
  return (
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
  );
}
