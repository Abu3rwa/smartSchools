import { useSelector } from 'react-redux';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';
import useStudentMyAssignmentsData from './hooks/useStudentMyAssignmentsData';
import AssignmentsPageHeader from './components/AssignmentsPageHeader';
import AssignmentsEmptyState from './components/AssignmentsEmptyState';
import AssignmentCard from './components/AssignmentCard';
import './StudentMyAssignmentsPage.css';

const StudentMyAssignmentsPage = () => {
  const academicYear = useSelector(selectCurrentAcademicYear);
  const { loading, orderedAssignments } = useStudentMyAssignmentsData();

  return (
    <div className="student-my-assignments-page">
      <AssignmentsPageHeader academicYear={academicYear} />

      {loading ? (
        <div className="loading-container">
          <div className="spinner" />
        </div>
      ) : orderedAssignments.length === 0 ? (
        <AssignmentsEmptyState />
      ) : (
        <div className="assignments-list">
          {orderedAssignments.map((assignment) => {
            const id = assignment?.id || assignment?._id;
            return <AssignmentCard key={id} assignment={assignment} />;
          })}
        </div>
      )}
    </div>
  );
};

export default StudentMyAssignmentsPage;
