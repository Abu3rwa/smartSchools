import { HiOutlineAcademicCap } from "react-icons/hi";
import { getGreeting } from "../utils/studentDashboardPresentation";

const StudentDashboardHeader = ({ firstName }) => {
  return (
    <header className="student-dashboard-header">
      <div className="student-dashboard-header-text">
        <h1>
          {getGreeting()}, {firstName}!
        </h1>
        <p>Here&apos;s your overview for today. Select a section to open it.</p>
      </div>
      <span className="student-dashboard-header-badge" aria-hidden="true">
        <HiOutlineAcademicCap size={24} />
      </span>
    </header>
  );
};

export default StudentDashboardHeader;
