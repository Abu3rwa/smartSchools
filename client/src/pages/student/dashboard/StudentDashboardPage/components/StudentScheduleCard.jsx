import { HiOutlineCalendar } from 'react-icons/hi';
import { formatTime12h } from '../utils/studentDashboardPresentation';

const StudentScheduleCard = ({ schedule }) => {
    return (
        <section className="student-card schedule-card">
            <h2><HiOutlineCalendar className="card-icon" /> Today&apos;s Schedule</h2>
            {schedule.length === 0 ? (
                <p className="empty-text">No classes scheduled for today.</p>
            ) : (
                <div className="schedule-table-wrap">
                    <table className="schedule-table">
                        <thead>
                            <tr>
                                <th>Period</th>
                                <th>Subject</th>
                                <th>Teacher</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schedule.map((item, index) => {
                                const startFormatted = formatTime12h(item.period?.startTime);
                                const endFormatted = formatTime12h(item.period?.endTime);
                                const timeText = startFormatted && endFormatted
                                    ? `${startFormatted} – ${endFormatted}`
                                    : (startFormatted || endFormatted || '—');

                                return (
                                    <tr key={index}>
                                        <td className="schedule-period" data-label="Period">{item.period?.name || `Period ${index + 1}`}</td>
                                        <td className="schedule-subject" data-label="Subject">{item.subject?.name || '—'}</td>
                                        <td className="schedule-teacher" data-label="Teacher">
                                            {item.teacher
                                                ? `${item.teacher.firstName || ''} ${item.teacher.lastName || ''}`.trim() || '—'
                                                : '—'}
                                        </td>
                                        <td className="schedule-time" data-label="Time">{timeText}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
};

export default StudentScheduleCard;
