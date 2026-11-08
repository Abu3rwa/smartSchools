import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../../store/slices/authSlice';
import practiceService from '../../../../services/practiceService';

const useStudentAssessmentResultData = () => {
  const { assignmentId } = useParams();
  const [searchParams] = useSearchParams();
  const user = useSelector(selectUser);
  const childId = searchParams.get('childId');
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await practiceService.getAssessmentResult(
          assignmentId,
          childId ? { childId } : {},
        );
        if (!cancelled) setResult(response?.data || null);
      } catch (requestError) {
        if (cancelled) return;
        const payload = requestError?.response?.data || {};
        setResult(null);
        setError({
          code: payload.code || '',
          status: requestError?.response?.status || 0,
          message: payload.message || 'unavailable',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [assignmentId, childId]);

  return {
    loading,
    result,
    error,
    isParent: user?.role === 'parent',
    backDestination: user?.role === 'parent' ? '/portal/dashboard' : '/portal/my-assignments',
  };
};

export default useStudentAssessmentResultData;
