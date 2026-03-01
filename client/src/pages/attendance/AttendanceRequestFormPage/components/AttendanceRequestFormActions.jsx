export default function AttendanceRequestFormActions({
  submitting,
  onCancel,
}) {
  return (
    <div className="form-actions">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onCancel}
        disabled={submitting}
      >
        Cancel
      </button>
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? "Submitting..." : "Submit request"}
      </button>
    </div>
  );
}
