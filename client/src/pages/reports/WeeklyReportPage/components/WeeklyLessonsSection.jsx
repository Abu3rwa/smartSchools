import { HiOutlineCalendar, HiOutlineLink } from 'react-icons/hi';
import { formatLessonDate } from '../utils/weeklyReportPresentation';

const WeeklyLessonsSection = ({ lessons }) => {
    return (
        <section className="report-section card">
            <div className="section-header">
                <HiOutlineCalendar size={24} />
                <h2>Lessons Taught This Week</h2>
            </div>

            {lessons.length > 0 ? (
                <div className="lessons-summary">
                    {lessons.map((lesson) => (
                        <div key={lesson._id} className="lesson-item">
                            <div className="lesson-info">
                                <span className="lesson-date">{formatLessonDate(lesson.date)}</span>
                                <h3>{lesson.title}</h3>
                                <p>{lesson.description}</p>
                                {lesson.resources?.length > 0 && (
                                    <div className="resource-links">
                                        {lesson.resources.map((resource, index) => (
                                            <a key={index} href={resource.url} target="_blank" rel="noopener noreferrer">
                                                <HiOutlineLink /> {resource.title || 'Resource'}
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="empty-msg">No lessons recorded for this week.</p>
            )}
        </section>
    );
};

export default WeeklyLessonsSection;
