import { HiOutlineClipboardList, HiOutlinePlus } from "react-icons/hi";

export default function MyAttendanceRequestsHeader({ onNewRequest }) {
  return (
    <header className="page-header">
      <div>
        <h1>
          <HiOutlineClipboardList className="header-icon" /> My Attendance
          Requests
        </h1>
        <p className="page-subtitle">
          View and submit attendance or leave requests.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onNewRequest}
      >
        <HiOutlinePlus className="btn-icon" /> New request
      </button>
    </header>
  );
}
