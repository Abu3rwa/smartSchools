const PracticeStatsGrid = ({ assignmentsCount, masteredCount, needsReviewCount, inProgressCount, notStartedCount }) => (
  <div className="practice-stats">
    <div className="practice-stat-card">
      <div className="stat-value">{assignmentsCount}</div>
      <div className="stat-label">Total Assigned</div>
    </div>
    <div className="practice-stat-card mastered">
      <div className="stat-value">{masteredCount}</div>
      <div className="stat-label">Mastered (Gold)</div>
    </div>
    <div className="practice-stat-card needs-review">
      <div className="stat-value">{needsReviewCount}</div>
      <div className="stat-label">Needs Review</div>
    </div>
    <div className="practice-stat-card in-progress">
      <div className="stat-value">{inProgressCount}</div>
      <div className="stat-label">In Progress</div>
    </div>
    <div className="practice-stat-card not-started">
      <div className="stat-value">{notStartedCount}</div>
      <div className="stat-label">Not Started</div>
    </div>
  </div>
);

export default PracticeStatsGrid;
