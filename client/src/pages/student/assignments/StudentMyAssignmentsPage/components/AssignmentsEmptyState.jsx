import { HiOutlineBookOpen } from 'react-icons/hi';

const AssignmentsEmptyState = () => {
  return (
    <div className="assignments-empty">
      <HiOutlineBookOpen size={48} className="empty-icon" />
      <h3>No assignments yet</h3>
      <p>Your teacher will share assignments here.</p>
    </div>
  );
};

export default AssignmentsEmptyState;
