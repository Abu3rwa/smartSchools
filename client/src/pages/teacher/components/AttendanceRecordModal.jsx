import { HiOutlineX, HiOutlineExclamation } from "react-icons/hi";
import { formatDateTime, getRoomLabel, getStudentName } from "../attendanceUtils";

const STATUS_OPTIONS = [
  { value: "present",        label: "Present" },
  { value: "absent",         label: "Absent" },
  { value: "tardy",          label: "Tardy" },
  { value: "tardy_excused",  label: "Tardy Excused" },
  { value: "absent_excused", label: "Absent Excused" },
];

const AttendanceRecordModal = ({
  schedule,
  students,
  studentAttendance,
  setStudentAttendance,
  error,
  saving,
  onSave,
  onClose,
}) => (
  <div className="modal-overlay">
    <div className="modal">
      <div className="modal-header">
        <h2>Record Attendance</h2>
        <button className="modal-close" onClick={onClose}>
          <HiOutlineX size={20} />
        </button>
      </div>
      <div className="modal-body">
        {error && (
          <div className="feedback-banner feedback-error compact">
            <HiOutlineExclamation size={16} />
            <span>{error}</span>
          </div>
        )}
        <div className="attendance-form">
          <h3>{schedule.title || schedule.class?.name}</h3>
          <p>{formatDateTime(schedule.startTime)} - {formatDateTime(schedule.endTime)}</p>
          <p>Room: {getRoomLabel(schedule.room) || "N/A"}</p>
          <div className="attendance-list">
            {students.length === 0 ? (
              <div className="empty-state compact"><p>No students found for this class.</p></div>
            ) : (
              students.map((student) => (
                <div key={student._id} className="attendance-item">
                  <div className="student-info">
                    <span className="student-name">{getStudentName(student)}</span>
                  </div>
                  <div className="attendance-status">
                    <select
                      className="status-select"
                      value={studentAttendance[student._id] || "present"}
                      onChange={(e) =>
                        setStudentAttendance((prev) => ({ ...prev, [student._id]: e.target.value }))
                      }
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={onSave}
          disabled={saving || students.length === 0}
        >
          {saving ? "Saving..." : "Save Attendance"}
        </button>
      </div>
    </div>
  </div>
);

export default AttendanceRecordModal;
