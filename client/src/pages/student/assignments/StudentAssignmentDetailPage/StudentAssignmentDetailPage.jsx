import { useParams } from 'react-router-dom';
import useStudentAssignmentDetailData from './hooks/useStudentAssignmentDetailData';
import AssignmentDetailEmptyState from './components/AssignmentDetailEmptyState';
import AssignmentDetailContent from './components/AssignmentDetailContent';
import './StudentAssignmentDetailPage.css';

const StudentAssignmentDetailPage = () => {
  const { assignmentId } = useParams();
  const { loading, assignment, lessonPlans } = useStudentAssignmentDetailData(assignmentId);

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
    return <AssignmentDetailEmptyState />;
  }

  return <AssignmentDetailContent assignment={assignment} lessonPlans={lessonPlans} />;
};

export default StudentAssignmentDetailPage;
