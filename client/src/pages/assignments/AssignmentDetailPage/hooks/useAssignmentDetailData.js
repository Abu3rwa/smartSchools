import { useEffect, useMemo, useState } from 'react';
import assignmentService from '../../../../services/assignmentService';
import { getValidLessonPlans } from '../utils/assignmentDetailPresentation';

const useAssignmentDetailData = (assignmentId) => {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadAssignment = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await assignmentService.getAssignmentById(assignmentId);
        if (!cancelled) setAssignment(response?.data || null);
      } catch (requestError) {
        if (!cancelled) {
          setAssignment(null);
          setError(requestError?.response?.data?.message || 'unavailable');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAssignment();

    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  const lessonPlans = useMemo(() => getValidLessonPlans(assignment), [assignment]);

  return { loading, assignment, lessonPlans, error };
};

export default useAssignmentDetailData;
