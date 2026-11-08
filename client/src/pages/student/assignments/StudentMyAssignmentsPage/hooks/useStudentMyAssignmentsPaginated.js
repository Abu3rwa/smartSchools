import { useCallback, useEffect, useRef, useState } from 'react';
import assignmentService from '../../../../../services/assignmentService';

const EMPTY_PAGINATION = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
  hasMore: false,
};

const useStudentMyAssignmentsPaginated = ({
  academicYear,
  semester,
  q,
  type,
  state,
  subject,
  sort,
  page,
  limit,
} = {}) => {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [sourceErrors, setSourceErrors] = useState([]);
  const [facets, setFacets] = useState({ subjects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestSeq = useRef(0);
  const hasLoadedRef = useRef(false);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await assignmentService.getMyAssignmentsPaginated(
          {
            academicYear: academicYear || undefined,
            semester: semester || undefined,
            q: q || undefined,
            type: type || undefined,
            state: state || undefined,
            subject: subject || undefined,
            sort: sort || undefined,
            page,
            limit,
          },
          { signal: controller.signal },
        );
        if (requestId !== requestSeq.current) return;
        const data = response?.data || {};
        setItems(Array.isArray(data.items) ? data.items : []);
        setPagination({ ...EMPTY_PAGINATION, ...(data.pagination || {}) });
        setSourceErrors(Array.isArray(data.sourceErrors) ? data.sourceErrors : []);
        setFacets({
          subjects: Array.isArray(data.facets?.subjects) ? data.facets.subjects : [],
        });
        hasLoadedRef.current = true;
      } catch (requestError) {
        if (controller.signal.aborted || requestId !== requestSeq.current) return;
        // A failed fetch is not an empty list. Keep whatever was already on
        // screen and surface a retryable error instead.
        setError(
          requestError?.response?.data?.message ||
            requestError?.message ||
            'unavailable',
        );
      } finally {
        if (requestId === requestSeq.current) setLoading(false);
      }
    };

    load();

    return () => {
      controller.abort();
    };
  }, [academicYear, semester, q, type, state, subject, sort, page, limit, reloadToken]);

  return {
    items,
    pagination,
    sourceErrors,
    facets,
    loading,
    error,
    hasLoaded: hasLoadedRef.current,
    reload,
  };
};

export default useStudentMyAssignmentsPaginated;
