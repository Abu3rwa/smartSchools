import { useMyAttendanceRequests } from "./hooks/useMyAttendanceRequests.js";
import MyAttendanceRequestsHeader from "./components/MyAttendanceRequestsHeader.jsx";
import MyAttendanceRequestsLoadingState from "./components/MyAttendanceRequestsLoadingState.jsx";
import MyAttendanceRequestsEmptyState from "./components/MyAttendanceRequestsEmptyState.jsx";
import MyAttendanceRequestsList from "./components/MyAttendanceRequestsList.jsx";
import "./MyAttendanceRequestsPage.css";

/**
 * My Attendance Requests page. Route: /portal/attendance-requests.
 * Lists user's submitted attendance/leave requests.
 */
export default function MyAttendanceRequestsPage() {
  const { requests, loading, onNewRequest } = useMyAttendanceRequests();

  return (
    <div className="my-attendance-requests-page">
      <MyAttendanceRequestsHeader onNewRequest={onNewRequest} />

      {loading ? (
        <MyAttendanceRequestsLoadingState />
      ) : requests.length === 0 ? (
        <MyAttendanceRequestsEmptyState onNewRequest={onNewRequest} />
      ) : (
        <MyAttendanceRequestsList requests={requests} />
      )}
    </div>
  );
}
