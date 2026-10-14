import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';
import useStudentMyAssignmentsData from './hooks/useStudentMyAssignmentsData';
import AssignmentsPageHeader from './components/AssignmentsPageHeader';
import AssignmentsEmptyState from './components/AssignmentsEmptyState';
import AssignmentCard from './components/AssignmentCard';
import './StudentMyAssignmentsPage.css';

const PAGE_SIZE = 10;

const StudentMyAssignmentsPage = () => {
  const academicYear = useSelector(selectCurrentAcademicYear);
  const { loading, orderedAssignments } = useStudentMyAssignmentsData();
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(orderedAssignments.length / PAGE_SIZE);
  const page = Math.min(currentPage, Math.max(totalPages, 1));
  const pageAssignments = orderedAssignments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const firstVisibleAssignment = orderedAssignments.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastVisibleAssignment = Math.min(page * PAGE_SIZE, orderedAssignments.length);

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
        <>
          <div className="assignments-list">
            {pageAssignments.map((assignment) => {
              const id = assignment?.id || assignment?._id;
              return <AssignmentCard key={id} assignment={assignment} />;
            })}
          </div>
          {totalPages > 1 ? (
            <nav className="assignments-pagination" aria-label="Assignments pages">
              <span aria-live="polite">
                Showing {firstVisibleAssignment}–{lastVisibleAssignment} of {orderedAssignments.length}
              </span>
              <div className="assignments-pagination-controls">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page === 1}
                  onClick={() => setCurrentPage((previousPage) => Math.max(1, previousPage - 1))}
                >
                  Previous
                </button>
                <span>Page {page} of {totalPages}</span>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page === totalPages}
                  onClick={() => setCurrentPage((previousPage) => Math.min(totalPages, previousPage + 1))}
                >
                  Next
                </button>
              </div>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
};

export default StudentMyAssignmentsPage;
