export default function PracticeAssessmentResultsErrorState({ error }) {
  return (
    <div className="empty-state">
      <p>{error}</p>
    </div>
  );
}
