import { useEffect, useMemo, useState } from 'react';
import assignmentService from '../../../../../services/assignmentService';
import practiceService from '../../../../../services/practiceService';
import toast from 'react-hot-toast';
import { orderAssignments } from '../utils/studentMyAssignmentsPresentation';
import { formatStandardLabel } from '../../../../../utils/standardLabel';

const getPracticeAssignmentType = (sessionType) => {
  switch (sessionType) {
    case 'assessment':
      return 'Graded Assessment';
    case 'homework':
      return 'Homework';
    case 'classwork':
      return 'Classwork';
    default:
      return 'Practice';
  }
};

const mapPracticeAssignment = (assignment) => {
  const id = assignment?._id || assignment?.id;
  const dueDate = assignment?.dueDate || assignment?.practiceConfig?.availability?.endAt || null;

  return {
    ...assignment,
    id,
    practiceAssignmentId: id,
    title: assignment?.title || formatStandardLabel(assignment?.standard) || 'Practice assignment',
    assignmentType: {
      name: getPracticeAssignmentType(assignment?.practiceConfig?.sessionType),
    },
    assignedDate: assignment?.assignedDate || assignment?.createdAt || null,
    dueDate,
    status: assignment?.isActive === false ? 'closed' : 'published',
  };
};

const useStudentMyAssignmentsData = () => {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadAssignments = async () => {
      setLoading(true);
      try {
        const [assignmentResponse, practiceResponse] = await Promise.all([
          assignmentService.getMyAssignments(),
          practiceService.getMyAssignments(),
        ]);
        const items = assignmentResponse?.data?.items || [];
        const practiceAssignments = practiceResponse?.data?.assignments || [];
        if (!cancelled) {
          const linkedPracticeIds = new Set(
            (Array.isArray(items) ? items : [])
              .map((assignment) => String(assignment?.practiceAssignmentId || ''))
              .filter(Boolean)
          );
          setAssignments([
            ...(Array.isArray(items) ? items : []),
            ...(Array.isArray(practiceAssignments)
              ? practiceAssignments
                .filter((assignment) => !linkedPracticeIds.has(String(assignment?._id || assignment?.id || '')))
                .map(mapPracticeAssignment)
              : []),
          ]);
        }
      } catch (error) {
        if (!cancelled) {
          setAssignments([]);
          toast.error(error?.response?.data?.message || 'Could not load assignments');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadAssignments();

    return () => {
      cancelled = true;
    };
  }, []);

  const orderedAssignments = useMemo(() => {
    return orderAssignments(assignments);
  }, [assignments]);

  return {
    loading,
    orderedAssignments,
  };
};

export default useStudentMyAssignmentsData;
