import {
    HiOutlineAcademicCap,
    HiOutlineCalendar,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineEye,
    HiOutlineUsers
} from 'react-icons/hi';

const AttendanceList = ({
    attendanceData,
    clearFilters,
    formatDateTime,
    formatTime,
    hasActiveFilters,
    onViewDetails
}) => {
    if (attendanceData.length === 0) {
        return (
            <div className="attendance-list">
                <div className="empty-state">
                    <HiOutlineCalendar size={48} />
                    <h3>No attendance records found</h3>
                    <p>
                        {hasActiveFilters
                            ? 'No attendance data matches the current filters for this period.'
                            : 'No attendance data is available for the selected period.'}
                    </p>
                    {hasActiveFilters && (
                        <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                            Clear Filters
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="attendance-list">
            {attendanceData.map((record) => (
                <div key={record._id} className="attendance-card">
                    <div className="attendance-header">
                        <div className="class-info">
                            <h3>{record.schedule.title}</h3>
                            <div className="class-details">
                                <span className="teacher-name">
                                    <HiOutlineUsers size={14} />
                                    {record.schedule.teacher
                                        ? `${record.schedule.teacher.firstName || ''} ${record.schedule.teacher.lastName || ''}`.trim()
                                        : '—'}
                                </span>
                                <span className="class-name">
                                    <HiOutlineAcademicCap size={14} />
                                    {record.schedule.class?.name ?? '—'}
                                </span>
                                <span className="subject">{record.schedule.subject?.name ?? '—'}</span>
                                <span className="room">{record.schedule.room ?? '—'}</span>
                            </div>
                        </div>
                        <div className="attendance-status">
                            {record.attendanceRecorded ? (
                                <div className="status-recorded">
                                    <HiOutlineCheckCircle size={20} color="green" />
                                    <span>Recorded</span>
                                </div>
                            ) : (
                                <div className="status-pending">
                                    <HiOutlineExclamation size={20} color="orange" />
                                    <span>Pending</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="attendance-content">
                        <div className="time-info">
                            <div className="time-item">
                                <HiOutlineClock size={16} />
                                <span>
                                    {formatTime(record.schedule.startTime)} - {formatTime(record.schedule.endTime)}
                                </span>
                            </div>
                            <div className="date-item">
                                <HiOutlineCalendar size={16} />
                                <span>{new Date(record.schedule.startTime).toLocaleDateString()}</span>
                            </div>
                        </div>

                        <div className="attendance-stats">
                            <div className="stat-item">
                                <span className="stat-label">Total:</span>
                                <span className="stat-value">{record.totalStudents}</span>
                            </div>
                            <div className="stat-item present">
                                <span className="stat-label">Present:</span>
                                <span className="stat-value">{record.present}</span>
                            </div>
                            <div className="stat-item absent">
                                <span className="stat-label">Absent:</span>
                                <span className="stat-value">{record.absent}</span>
                            </div>
                            <div className="stat-item late">
                                <span className="stat-label">Late:</span>
                                <span className="stat-value">{record.late}</span>
                            </div>
                            <div className="stat-item rate">
                                <span className="stat-label">Rate:</span>
                                <span className="stat-value">{record.attendanceRate}%</span>
                            </div>
                        </div>
                    </div>

                    <div className="attendance-meta">
                        {record.attendanceRecorded && record.recordedBy && (
                            <div className="recorded-info">
                                <span>
                                    Recorded by {record.recordedBy.firstName} {record.recordedBy.lastName}
                                </span>
                                <span>{formatDateTime(record.recordedAt)}</span>
                            </div>
                        )}
                    </div>

                    <div className="attendance-actions">
                        <button className="action-btn" onClick={() => onViewDetails(record)}>
                            <HiOutlineEye size={16} />
                            View Details
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AttendanceList;
