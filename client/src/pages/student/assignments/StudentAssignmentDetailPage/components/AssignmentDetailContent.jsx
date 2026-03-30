import { Link } from 'react-router-dom';
import { HiOutlineArrowLeft, HiOutlineCalendar, HiOutlineDocumentText } from 'react-icons/hi';
import { formatDateTime } from '../utils/studentAssignmentDetailPresentation';

const AssignmentDetailContent = ({ assignment, lessonPlans }) => {
  return (
    <div className="student-assignment-detail-page">
      <Link to="/portal/my-assignments" className="btn btn-ghost back-btn">
        <HiOutlineArrowLeft size={18} />
        Back to assignments
      </Link>

      <article className="detail-card">
        <header className="detail-header">
          <p className="detail-type">{assignment?.assignmentType?.name || 'Assignment'}</p>
          <h1>{assignment?.title || 'Class assignment'}</h1>
          <p className="detail-meta">
            {assignment?.subject?.name ? `Subject: ${assignment.subject.name}` : 'Subject not specified'}
            {assignment?.class?.name ? ` • Class: ${assignment.class.name}` : ''}
          </p>
        </header>

        <section className="detail-section">
          <h2>
            <HiOutlineCalendar size={18} />
            Timeline
          </h2>
          <div className="timeline-grid">
            <div>
              <span className="timeline-label">Assigned</span>
              <p>{formatDateTime(assignment?.assignedDate)}</p>
            </div>
            <div>
              <span className="timeline-label">Due</span>
              <p>{formatDateTime(assignment?.dueDate)}</p>
            </div>
          </div>
        </section>

        <section className="detail-section">
          <h2>
            <HiOutlineDocumentText size={18} />
            Instructions
          </h2>
          {assignment?.instructions ? (
            <p className="instructions-text">{assignment.instructions}</p>
          ) : (
            <p className="muted">No instructions were provided for this assignment.</p>
          )}
        </section>

        {lessonPlans.length > 0 ? (
          <section className="detail-section">
            <h2>Linked lesson plans</h2>
            <ul className="lesson-plan-list">
              {lessonPlans.map((lesson) => (
                <li key={lesson.id || `${lesson.title}-${lesson.date}`}>
                  <span className="lesson-title">{lesson.title || 'Lesson plan'}</span>
                  <span className="lesson-date">{formatDateTime(lesson.date)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </div>
  );
};

export default AssignmentDetailContent;
