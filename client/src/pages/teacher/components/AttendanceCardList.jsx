import {
  HiOutlineCalendar, HiOutlineClock,
  HiOutlineCheckCircle, HiOutlineExclamation,
  HiOutlineEye, HiOutlinePencil,
} from "react-icons/hi";
import { formatTime } from "../attendanceUtils";

const AttendanceCardList = ({ items, onViewDetails, onRecordAttendance }) => {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <HiOutlineCalendar size={48} />
        <h3>No attendance records found</h3>
        <p>No attendance data available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="attendance-cards">
      {items.map((item) => (
        <div key={item.id} className="attendance-card">
          <div className="attendance-header">
            <div className="class-info">
              <h3>{item.title}</h3>
              <div className="class-details">
                <span className="class-name">{item.className}</span>
                <span className="subject">{item.subjectName}</span>
                <span className="room">{item.room}</span>
              </div>
            </div>
            <div className="attendance-status">
              {item.isRecorded ? (
                <div className="status-recorded">
                  <HiOutlineCheckCircle size={20} />
                  <span>Recorded</span>
                </div>
              ) : (
                <div className="status-pending">
                  <HiOutlineExclamation size={20} />
                  <span>Pending</span>
                </div>
              )}
            </div>
          </div>

          <div className="attendance-content">
            <div className="time-info">
              <div className="time-item">
                <HiOutlineClock size={16} />
                <span>{formatTime(item.startTime)} - {formatTime(item.endTime)}</span>
              </div>
              <div className="date-item">
                <HiOutlineCalendar size={16} />
                <span>{new Date(item.startTime).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="attendance-stats">
              <div className="stat-item"><span className="stat-label">Total</span><span className="stat-value">{item.totalStudents}</span></div>
              <div className="stat-item present"><span className="stat-label">Present</span><span className="stat-value">{item.present}</span></div>
              <div className="stat-item absent"><span className="stat-label">Absent</span><span className="stat-value">{item.absent}</span></div>
              <div className="stat-item late"><span className="stat-label">Late</span><span className="stat-value">{item.late}</span></div>
              <div className="stat-item rate"><span className="stat-label">Rate</span><span className="stat-value">{item.isRecorded ? `${item.attendanceRate}%` : "--"}</span></div>
            </div>
          </div>

          <div className="attendance-actions">
            {item.isRecorded ? (
              <button className="action-btn" onClick={() => onViewDetails(item.rawRecord)}>
                <HiOutlineEye size={16} /> View Details
              </button>
            ) : (
              <button className="action-btn primary" onClick={() => onRecordAttendance(item.rawSchedule)}>
                <HiOutlinePencil size={16} /> Record Attendance
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AttendanceCardList;
