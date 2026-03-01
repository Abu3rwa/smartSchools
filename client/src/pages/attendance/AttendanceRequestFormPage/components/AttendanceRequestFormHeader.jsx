import { HiOutlineClipboardList } from "react-icons/hi";

export default function AttendanceRequestFormHeader() {
  return (
    <header className="page-header">
      <h1>
        <HiOutlineClipboardList className="header-icon" /> Attendance Request
      </h1>
      <p className="page-subtitle">
        Submit an attendance or leave request. You will be notified when it is
        reviewed.
      </p>
    </header>
  );
}
