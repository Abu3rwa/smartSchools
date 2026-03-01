import { statusConfig } from "../constants.js";
import { formatDate, formatTimeRange } from "../utils/myAttendanceRequestsPresentation.js";

export default function MyAttendanceRequestsList({ requests }) {
  return (
    <div className="requests-list">
      <div className="requests-table-header">
        <span>Date</span>
        <span>Type</span>
        <span>Time</span>
        <span>Status</span>
        <span className="hide-mobile">Review note</span>
      </div>
      {requests.map((r) => {
        const config = statusConfig[r.status] || statusConfig.pending;
        const Icon = config.Icon;
        const typeLabel =
          r.requestType?.labelEn || r.requestType?.labelAr || "—";
        return (
          <div key={r._id} className={`request-card ${config.className}`}>
            <div className="request-main">
              <span className="request-date">
                {formatDate(r.startDate || r.requestDate || r.createdAt)}
              </span>
              <span className="request-type">{typeLabel}</span>
              <span className="request-time">{formatTimeRange(r)}</span>
              <span className="request-status">
                <Icon className="status-icon" /> {config.label}
              </span>
              <span className="request-note hide-mobile">
                {r.reviewNote || "—"}
              </span>
            </div>
            {r.reviewNote && (
              <div className="request-note-mobile show-mobile">
                <strong>Review note:</strong> {r.reviewNote}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
