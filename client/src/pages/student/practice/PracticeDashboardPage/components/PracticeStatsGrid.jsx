const PracticeStatsGrid = ({ assignmentsCount, masteredCount, needsReviewCount, inProgressCount, notStartedCount }) => (
  <div className="practice-stats">
    <div className="practice-stat-card">
      <div className="stat-value">{assignmentsCount}</div>
      <div className="stat-label">Assigned</div>
    </div>
    <div className="practice-stat-card mastered">
      <div className="stat-value">{masteredCount}</div>
      <div className="stat-label">Completed</div>
    </div>
    <div className="practice-stat-card needs-review">
      <div className="stat-value">{notStartedCount}</div>
      <div className="stat-label">Ready to Start</div>
    </div>
    <div className="practice-stat-card in-progress">
      <div className="stat-value">{inProgressCount + needsReviewCount}</div>
      <div className="stat-label">Keep Going</div>
    </div>
    <div className="practice-stat-card not-started">
      <div className="stat-value">{needsReviewCount}</div>
      <div className="stat-label">Needs Review</div>
    </div>
  </div>
);

export default PracticeStatsGrid;
