export default function PracticeAssessmentResultsStandardAveragesTable({
  standardAverages,
}) {
  return (
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
                <td>
                  {item.standardCode} - {item.standardName}
                </td>
                <td>{item.totalAssessments}</td>
                <td>{item.averagePercentage}%</td>
                <td>{item.averageScale4}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
