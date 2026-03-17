import {
  HiOutlineCalendar, HiOutlineCheckCircle,
  HiOutlineExclamation, HiOutlineUserGroup,
} from "react-icons/hi";

const AttendanceStatsGrid = ({ stats }) => (
  <div className="stats-grid">
    <div className="stat-card">
      <div className="stat-icon"><HiOutlineCalendar size={24} /></div>
      <div className="stat-content">
        <h3>{stats.totalClasses}</h3>
        <p>Total Classes</p>
      </div>
    </div>
    <div className="stat-card">
      <div className="stat-icon"><HiOutlineCheckCircle size={24} /></div>
      <div className="stat-content">
        <h3>{stats.recordedClasses}</h3>
        <p>Attendance Recorded</p>
      </div>
    </div>
    <div className="stat-card">
      <div className="stat-icon"><HiOutlineExclamation size={24} /></div>
      <div className="stat-content">
        <h3>{stats.pendingClasses}</h3>
        <p>Pending Attendance</p>
      </div>
    </div>
    <div className="stat-card">
      <div className="stat-icon"><HiOutlineUserGroup size={24} /></div>
      <div className="stat-content">
        <h3>{stats.overallRate}%</h3>
        <p>Overall Attendance Rate</p>
      </div>
    </div>
  </div>
);

export default AttendanceStatsGrid;
