import { Link } from 'react-router-dom';
import { HiOutlineChevronRight } from 'react-icons/hi';
import { formatDueDate, getStatusMeta } from '../utils/studentMyAssignmentsPresentation';

const AssignmentCard = ({ assignment }) => {
  const statusMeta = getStatusMeta(assignment);
  const id = assignment?.id || assignment?._id;

  return (
    <article className="assignment-card">
      <div className="card-main">
        <div className="card-top-row">
          <span className={`status-pill ${statusMeta.className}`}>{statusMeta.label}</span>
          <span className="card-type">{assignment?.assignmentType?.name || 'Assignment'}</span>
        </div>
        <h3 className="card-title">{assignment?.title || 'Class assignment'}</h3>
        {assignment?.subject?.name ? (
          <p className="card-subject">Subject: {assignment.subject.name}</p>
        ) : null}
        <p className="card-due">Due {formatDueDate(assignment?.dueDate)}</p>
      </div>
      <div className="card-footer">
        <Link to={`/portal/my-assignments/${id}`} className="btn btn-primary btn-sm">
          View assignment
          <HiOutlineChevronRight size={16} />
        </Link>
      </div>
    </article>
  );
};

export default AssignmentCard;
