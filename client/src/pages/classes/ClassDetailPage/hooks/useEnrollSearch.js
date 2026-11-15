import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import api from '../../../../config/api';
import {
  INITIAL_ENROLL_SEARCH,
  enrollSearchReducer,
  filterEnrollableStudents
} from '../utils/classDetailState';

const MIN_QUERY_LENGTH = 2;
const SEARCH_LIMIT = 20;
const DEBOUNCE_MS = 400;

const useEnrollSearch = ({ enrolledIds, active }) => {
  const [query, setQueryValue] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [state, dispatch] = useReducer(enrollSearchReducer, INITIAL_ENROLL_SEARCH);
  const sequenceRef = useRef(0);
  const enrolledRef = useRef(enrolledIds);

  useEffect(() => {
    enrolledRef.current = enrolledIds;
  }, [enrolledIds]);

  const invalidate = useCallback(() => {
    sequenceRef.current += 1;
  }, []);

  const setQuery = useCallback((value) => {
    setQueryValue(value);
  }, []);

  const reset = useCallback(() => {
    invalidate();
    setQueryValue('');
    setRetryToken(0);
    dispatch({ type: 'reset' });
  }, [invalidate]);

  const retry = useCallback(() => {
    setRetryToken((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      invalidate();
      dispatch({ type: 'short-query' });
      return undefined;
    }

    sequenceRef.current += 1;
    const sequence = sequenceRef.current;
    dispatch({ type: 'searching' });

    const timer = setTimeout(async () => {
      try {
        const response = await api.get('/students', {
          params: { search: trimmed, limit: SEARCH_LIMIT, status: 'active' }
        });
        if (sequenceRef.current !== sequence) return;
        const rawResults = response.data?.data?.students || [];
        dispatch({
          type: 'results',
          rawCount: rawResults.length,
          results: filterEnrollableStudents(rawResults, enrolledRef.current)
        });
      } catch (error) {
        if (sequenceRef.current !== sequence) return;
        dispatch({ type: 'error', error: error.response?.data?.message || '' });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [active, query, retryToken, invalidate]);

  useEffect(() => () => invalidate(), [invalidate]);

  return {
    query,
    setQuery,
    reset,
    retry,
    status: state.status,
    results: state.results,
    error: state.error,
    searching: state.status === 'searching'
  };
};

export default useEnrollSearch;
