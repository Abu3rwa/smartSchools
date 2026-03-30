import { useEffect, useMemo, useState } from 'react';
import assignmentService from '../../../../../services/assignmentService';
import toast from 'react-hot-toast';
import { getValidLessonPlans } from '../utils/studentAssignmentDetailPresentation';

const useStudentAssignmentDetailData = (assignmentId) => {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadAssignment = async () => {
      setLoading(true);
      try {
        const response = await assignmentService.getMyAssignments();
        const items = Array.isArray(response?.data?.items) ? response.data.items : [];
        const selected = items.find((item) => String(item?.id || item?._id) === String(assignmentId));

        if (!cancelled) {
          setAssignment(selected || null);
        }
      } catch (error) {
        if (!cancelled) {
          setAssignment(null);
          toast.error(error?.response?.data?.message || 'Could not load assignment details');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadAssignment();

    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  const lessonPlans = useMemo(() => {
    return getValidLessonPlans(assignment);
  }, [assignment]);

  return {
    loading,
    assignment,
    lessonPlans,
  };
};

export default useStudentAssignmentDetailData;
