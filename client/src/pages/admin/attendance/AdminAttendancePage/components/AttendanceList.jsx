import {
    HiOutlineAcademicCap,
    HiOutlineCalendar,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineEye,
    HiOutlineUsers
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const AttendanceList = ({
    attendanceData,
    clearFilters,
    formatDate,
    formatDateTime,
    formatTime,
    hasActiveFilters,
    onViewDetails
}) => {
    const { t } = useTranslation(['adminAttendance', 'common']);
    if (attendanceData.length === 0) {
        return (
            <div className="attendance-list">
                <div className="empty-state">
                    <HiOutlineCalendar size={48} />
                    <h3>{t('adminAttendance:list.emptyTitle')}</h3>
                    <p>
                        {hasActiveFilters
                            ? t('adminAttendance:list.emptyFiltered')
                            : t('adminAttendance:list.emptyUnfiltered')}
                    </p>
                    {hasActiveFilters && (
                        <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                            {t('adminAttendance:actions.clearFilters')}
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
                                            : t('adminAttendance:common.dash')}
                                </span>
                                <span className="class-name">
                                    <HiOutlineAcademicCap size={14} />
                                    {record.schedule.class?.name ?? t('adminAttendance:common.dash')}
                                </span>
                                <span className="subject">{record.schedule.subject?.name ?? t('adminAttendance:common.dash')}</span>
                                <span className="room">{record.schedule.room ?? t('adminAttendance:common.dash')}</span>
                            </div>
                        </div>
                        <div className="attendance-status">
                            {record.attendanceRecorded ? (
                                <div className="status-recorded">
                                    <HiOutlineCheckCircle size={20} color="green" />
                                    <span>{t('adminAttendance:status.recorded')}</span>
                                </div>
                            ) : (
                                <div className="status-pending">
                                    <HiOutlineExclamation size={20} color="orange" />
                                    <span>{t('adminAttendance:status.pending')}</span>
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
                                <span>{formatDate(record.schedule.startTime)}</span>
                            </div>
                        </div>

                        <div className="attendance-stats">
                            <div className="stat-item">
                                <span className="stat-label">{t('adminAttendance:list.total')}</span>
                                <span className="stat-value">{record.totalStudents}</span>
                            </div>
                            <div className="stat-item present">
                                <span className="stat-label">{t('adminAttendance:list.present')}</span>
                                <span className="stat-value">{record.present}</span>
                            </div>
                            <div className="stat-item absent">
                                <span className="stat-label">{t('adminAttendance:list.absent')}</span>
                                <span className="stat-value">{record.absent}</span>
                            </div>
                            <div className="stat-item late">
                                <span className="stat-label">{t('adminAttendance:list.late')}</span>
                                <span className="stat-value">{record.late}</span>
                            </div>
                            <div className="stat-item rate">
                                <span className="stat-label">{t('adminAttendance:list.rate')}</span>
                                <span className="stat-value">{record.attendanceRate}%</span>
                            </div>
                        </div>
                    </div>

                    <div className="attendance-meta">
                        {record.attendanceRecorded && record.recordedBy && (
                            <div className="recorded-info">
                                <span>
                                    {t('adminAttendance:list.recordedBy', { firstName: record.recordedBy.firstName, lastName: record.recordedBy.lastName })}
                                </span>
                                <span>{formatDateTime(record.recordedAt)}</span>
                            </div>
                        )}
                    </div>

                    <div className="attendance-actions">
                        <button className="action-btn" onClick={() => onViewDetails(record)}>
                            <HiOutlineEye size={16} />
                            {t('adminAttendance:actions.viewDetails')}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AttendanceList;
