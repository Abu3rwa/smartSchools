import {
    HiOutlineCalendar,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineUserGroup
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const AttendanceStatsGrid = ({ stats }) => {
    const { t } = useTranslation(['adminAttendance']);

    return (
        <div className="stats-grid">
            <div className="stat-card">
                <div className="stat-icon">
                    <HiOutlineCalendar size={24} />
                </div>
                <div className="stat-content">
                    <h3>{stats.totalClasses}</h3>
                    <p>{t('adminAttendance:stats.totalClasses')}</p>
                </div>
            </div>

            <div className="stat-card">
                <div className="stat-icon">
                    <HiOutlineCheckCircle size={24} />
                </div>
                <div className="stat-content">
                    <h3>{stats.recordedClasses}</h3>
                    <p>{t('adminAttendance:stats.attendanceRecorded')}</p>
                </div>
            </div>

            <div className="stat-card">
                <div className="stat-icon">
                    <HiOutlineClock size={24} />
                </div>
                <div className="stat-content">
                    <h3>{stats.pendingToday}</h3>
                    <p>{t('adminAttendance:stats.pendingToday')}</p>
                </div>
            </div>

            <div className="stat-card">
                <div className="stat-icon">
                    <HiOutlineExclamation size={24} />
                </div>
                <div className="stat-content">
                    <h3>{stats.pendingOverall}</h3>
                    <p>{t('adminAttendance:stats.overallNotTaken')}</p>
                </div>
            </div>

            <div className="stat-card">
                <div className="stat-icon">
                    <HiOutlineUserGroup size={24} />
                </div>
                <div className="stat-content">
                    <h3>{stats.overallRate}%</h3>
                    <p>{t('adminAttendance:stats.overallAttendanceRate')}</p>
                </div>
            </div>
        </div>
    );
};

export default AttendanceStatsGrid;
