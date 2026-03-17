import { HiOutlineX, HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineExclamation } from "react-icons/hi";
import { formatDateTime, getRoomLabel, getRecordTitle, getStatusClassName } from "../attendanceUtils";

const STATUS_LABELS = {
  present:        "Present",
  absent:         "Absent",
  tardy:          "Tardy",
  tardy_excused:  "Tardy Excused",
  absent_excused: "Absent Excused",
};

function getStatusIcon(status) {
  if (status === "present") return <HiOutlineCheckCircle size={16} />;
  if (status === "absent" || status === "absent_excused") return <HiOutlineXCircle size={16} />;
  return <HiOutlineExclamation size={16} />;
}

const AttendanceDetailsModal = ({ record, onClose }) => (
  <div className="modal-overlay">
    <div className="modal">
      <div className="modal-header">
        <h2>Attendance Details</h2>
        <button className="modal-close" onClick={onClose}><HiOutlineX size={20} /></button>
      </div>
      <div className="modal-body">
        <div className="attendance-details">
          <h3>{getRecordTitle(record)}</h3>
          <p>{formatDateTime(record.startTime || record.date)} - {formatDateTime(record.endTime || record.date)}</p>
          <p>Room: {getRoomLabel(record.room || record.schedule?.room) || "N/A"}</p>

          <div className="attendance-summary">
            <div className="summary-stats">
              {[
                { label: "Total Students",  value: record.totalStudents || 0 },
                { label: "Present",         value: record.present        || 0, cls: "present" },
                { label: "Absent",          value: record.absent         || 0, cls: "absent"  },
                { label: "Late",            value: record.late           || 0, cls: "late"    },
                { label: "Attendance Rate", value: `${record.attendanceRate || 0}%`, cls: "rate" },
              ].map(({ label, value, cls }) => (
                <div key={label} className={`summary-item ${cls || ""}`.trim()}>
                  <span className="label">{label}</span>
                  <span className="value">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="student-attendance-list">
            <h4>Student Attendance</h4>
            {(record.studentAttendance || []).map((entry, index) => (
              <div key={entry.student?._id || index} className="student-attendance-item">
                <div className="student-details">
                  <span className="student-name">
                    {typeof entry.student === "object"
                      ? `${entry.student.firstName || ""} ${entry.student.lastName || ""}`.trim() || "Student"
                      : "Student"}
                  </span>
                </div>
                <div className={`attendance-status ${getStatusClassName(entry.status)}`}>
                  {getStatusIcon(entry.status)}
                  <span>{STATUS_LABELS[entry.status] || entry.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  </div>
);

export default AttendanceDetailsModal;
