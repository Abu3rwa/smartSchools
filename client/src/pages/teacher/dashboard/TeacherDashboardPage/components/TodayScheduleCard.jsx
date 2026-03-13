import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineCalendar } from 'react-icons/hi';
import SectionCard from './SectionCard';
import { formatTime } from '../utils/teacherDashboardPresentation';

const TodayScheduleCard = ({ todaySchedule, timetableError }) => {
    const { t, i18n } = useTranslation(['dashboard']);
    const locale = i18n.resolvedLanguage || i18n.language;

    return (
        <SectionCard
            className="schedule-card"
            title={t('dashboard:teacherDashboard.todaySchedule.title')}
            icon={HiOutlineCalendar}
            action={
                <Link to="/portal/my-timetable" className="btn btn-ghost btn-sm">
                    {t('dashboard:teacherDashboard.todaySchedule.fullTimetable')}
                </Link>
            }
        >
            {timetableError ? (
                <p className="empty-text">{t('dashboard:teacherDashboard.todaySchedule.loadError')}</p>
            ) : todaySchedule.length === 0 ? (
                <p className="empty-text">{t('dashboard:teacherDashboard.todaySchedule.empty')}</p>
            ) : (
                <ul className="teacher-schedule-list">
                    {todaySchedule.map((assignment, index) => (
                        <li key={assignment._id || index} className="teacher-schedule-item">
                            <span className="period-time">
                                {formatTime(assignment.startTime, locale)} – {formatTime(assignment.endTime, locale)}
                            </span>
                            <span className="period-name">
                                {assignment._periodObj?.name || assignment.period?.name || t('dashboard:teacherDashboard.todaySchedule.periodFallback', { index: index + 1 })}
                            </span>
                            <span className="subject-name">{assignment.subject?.name || '—'}</span>
                            <span className="class-name">{assignment.class?.name || '—'}</span>
                            <span className="room-name">{assignment.room?.name || assignment.room || '—'}</span>
                        </li>
                    ))}
                </ul>
            )}
        </SectionCard>
    );
};

export default TodayScheduleCard;
