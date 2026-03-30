import { useEffect, useMemo, useState } from 'react';
import assignmentService from '../../../../../services/assignmentService';
import toast from 'react-hot-toast';
import { orderAssignments } from '../utils/studentMyAssignmentsPresentation';

const useStudentMyAssignmentsData = () => {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadAssignments = async () => {
      setLoading(true);
      try {
        const response = await assignmentService.getMyAssignments();
        const items = response?.data?.items || [];
        if (!cancelled) {
          setAssignments(Array.isArray(items) ? items : []);
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
