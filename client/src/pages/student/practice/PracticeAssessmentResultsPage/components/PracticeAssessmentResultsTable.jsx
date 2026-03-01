export default function PracticeAssessmentResultsTable({ items }) {
  return (
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
  );
}
