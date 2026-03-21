export default function PracticeAssessmentResultsStatsRow({ summary }) {
  const formatNumber = (value, decimals = 2) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    return numeric
      .toFixed(decimals)
      .replace(/\.00$/, '')
      .replace(/(\.\d*[1-9])0$/, '$1');
  };

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
        <div className="stat-value">{formatNumber(summary?.averagePercentage)}%</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Average 1-4</div>
        <div className="stat-value">{formatNumber(summary?.averageScale4)}</div>
      </div>
    </div>
  );
}
