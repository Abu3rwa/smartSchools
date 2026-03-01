import { HiOutlinePlus } from "react-icons/hi";

export default function MyAttendanceRequestsEmptyState({ onNewRequest }) {
  return (
    <div className="empty-state">
      <p>You have not submitted any attendance requests yet.</p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onNewRequest}
      >
        <HiOutlinePlus className="btn-icon" /> Submit your first request
      </button>
    </div>
  );
}
