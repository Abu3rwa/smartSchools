import { HiOutlineX } from 'react-icons/hi';

const AttendanceDetailsModal = ({ formatDateTime, onClose, selectedAttendance, show }) => {
    if (!show || !selectedAttendance) {
        return null;
    }

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h2>Attendance Details</h2>
                    <button className="modal-close" onClick={onClose}>
                        <HiOutlineX size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="attendance-details">
                        <h3>{selectedAttendance.schedule.title}</h3>
                        <div className="schedule-info">
                            <p>
                                <strong>Teacher:</strong>{' '}
                                {selectedAttendance.schedule.teacher
                                    ? `${selectedAttendance.schedule.teacher.firstName || ''} ${selectedAttendance.schedule.teacher.lastName || ''}`.trim()
                                    : '—'}
                            </p>
                            <p>
                                <strong>Class:</strong> {selectedAttendance.schedule.class?.name ?? '—'}
                            </p>
                            <p>
                                <strong>Subject:</strong> {selectedAttendance.schedule.subject?.name ?? '—'}
                            </p>
                            <p>
                                <strong>Room:</strong> {selectedAttendance.schedule.room ?? '—'}
                            </p>
                            <p>
                                <strong>Time:</strong>{' '}
                                {formatDateTime(selectedAttendance.schedule.startTime)} -{' '}
                                {formatDateTime(selectedAttendance.schedule.endTime)}
                            </p>
                        </div>

                        <div className="attendance-summary">
                            <h4>Attendance Summary</h4>
                            <div className="summary-stats">
                                <div className="summary-item">
                                    <span className="label">Total Students:</span>
                                    <span className="value">{selectedAttendance.totalStudents}</span>
                                </div>
                                <div className="summary-item present">
                                    <span className="label">Present:</span>
                                    <span className="value">{selectedAttendance.present}</span>
                                </div>
                                <div className="summary-item absent">
                                    <span className="label">Absent:</span>
                                    <span className="value">{selectedAttendance.absent}</span>
                                </div>
                                <div className="summary-item late">
                                    <span className="label">Late:</span>
                                    <span className="value">{selectedAttendance.late}</span>
                                </div>
                                <div className="summary-item rate">
                                    <span className="label">Attendance Rate:</span>
                                    <span className="value">{selectedAttendance.attendanceRate}%</span>
                                </div>
                            </div>
                        </div>

                        {selectedAttendance.attendanceRecorded && selectedAttendance.recordedBy && (
                            <div className="recorded-details">
                                <h4>Recording Details</h4>
                                <p>
                                    <strong>Recorded by:</strong> {selectedAttendance.recordedBy.firstName}{' '}
                                    {selectedAttendance.recordedBy.lastName}
                                </p>
                                <p>
                                    <strong>Recorded at:</strong>{' '}
                                    {formatDateTime(selectedAttendance.recordedAt)}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AttendanceDetailsModal;
