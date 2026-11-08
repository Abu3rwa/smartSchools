import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../store/slices/authSlice';
import useAssignmentDetailData from './hooks/useAssignmentDetailData';
import AssignmentDetailEmptyState from './components/AssignmentDetailEmptyState';
import AssignmentDetailContent from './components/AssignmentDetailContent';
import './AssignmentDetailPage.css';

const AssignmentDetailPage = () => {
  const { assignmentId } = useParams();
  const user = useSelector(selectUser);
  const isParent = user?.role === 'parent';
  const { loading, assignment, lessonPlans } = useAssignmentDetailData(assignmentId);

  if (loading) {
    return (
      <div className="student-assignment-detail-page">
        <div className="loading-container">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!assignment) {
    return <AssignmentDetailEmptyState isParent={isParent} />;
  }

  return (
    <AssignmentDetailContent
      assignment={assignment}
      lessonPlans={lessonPlans}
      isParent={isParent}
    />
  );
};

export default AssignmentDetailPage;
