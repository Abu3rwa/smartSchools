import { Link } from 'react-router-dom';
import { HiOutlineArrowLeft } from 'react-icons/hi';

const AssignmentDetailEmptyState = () => {
  return (
    <div className="student-assignment-detail-page">
      <Link to="/portal/my-assignments" className="btn btn-ghost back-btn">
        <HiOutlineArrowLeft size={18} />
        Back to assignments
      </Link>
      <div className="detail-empty">
        <h3>Assignment not found</h3>
        <p>This assignment is unavailable or was removed.</p>
      </div>
    </div>
  );
};

export default AssignmentDetailEmptyState;
