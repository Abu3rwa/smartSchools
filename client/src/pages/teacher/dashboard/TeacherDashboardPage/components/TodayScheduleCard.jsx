import { Link } from 'react-router-dom';
import { HiOutlineCalendar } from 'react-icons/hi';
import SectionCard from './SectionCard';
import { formatTime } from '../utils/teacherDashboardPresentation';

const TodayScheduleCard = ({ todaySchedule, timetableError }) => {
    return (
        <SectionCard
            className="schedule-card"
            title="Today's Schedule"
            icon={HiOutlineCalendar}
            action={
                <Link to="/portal/my-timetable" className="btn btn-ghost btn-sm">
                    Full timetable
                </Link>
            }
        >
            {timetableError ? (
                <p className="empty-text">Could not load schedule.</p>
            ) : todaySchedule.length === 0 ? (
                <p className="empty-text">No classes scheduled for today.</p>
            ) : (
                <ul className="teacher-schedule-list">
                    {todaySchedule.map((assignment, index) => (
                        <li key={assignment._id || index} className="teacher-schedule-item">
                            <span className="period-time">
                                {formatTime(assignment.startTime)} – {formatTime(assignment.endTime)}
                            </span>
                            <span className="period-name">
                                {assignment._periodObj?.name || assignment.period?.name || `Period ${index + 1}`}
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
