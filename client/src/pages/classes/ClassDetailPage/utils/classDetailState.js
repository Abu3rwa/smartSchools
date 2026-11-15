export const INITIAL_ENROLL_SEARCH = {
  status: 'idle',
  results: [],
  rawCount: 0,
  error: null
};

export const enrollSearchReducer = (state, action) => {
  switch (action.type) {
    case 'reset':
    case 'short-query':
      return INITIAL_ENROLL_SEARCH;
    case 'searching':
      return { ...state, status: 'searching', error: null };
    case 'results': {
      const results = Array.isArray(action.results) ? action.results : [];
      const rawCount = Number(action.rawCount) || 0;
      const status = rawCount === 0 ? 'empty' : results.length === 0 ? 'all-enrolled' : 'ready';
      return { status, results, rawCount, error: null };
    }
    case 'error':
      return { status: 'error', results: [], rawCount: 0, error: action.error || '' };
    default:
      return state;
  }
};

export const resolveDetailView = ({ status, routeId, currentClassId, detailClassId = null, error = null }) => {
  const hasMatch = Boolean(routeId && currentClassId && String(routeId) === String(currentClassId));
  const matchesDetail = !detailClassId || String(detailClassId) === String(routeId);

  if (status === 'ready' && hasMatch && matchesDetail) {
    return { kind: 'ready', refreshing: false, error: null };
  }
  if (status === 'error' && hasMatch) {
    return { kind: 'ready', refreshing: false, error: error || 'error' };
  }
  if (status === 'notFound') return { kind: 'notFound', refreshing: false, error: null };
  if (status === 'forbidden') return { kind: 'forbidden', refreshing: false, error: null };
  if (status === 'error') return { kind: 'error', refreshing: false, error: error || 'error' };
  if (status === 'loading' && hasMatch) {
    return { kind: 'ready', refreshing: true, error: null };
  }
  return { kind: 'loading', refreshing: false, error: null };
};

export const formatTeacherName = (teacher) =>
  [teacher?.user?.firstName, teacher?.user?.lastName].filter(Boolean).join(' ').trim();

export const filterEnrollableStudents = (students, enrolledIds) =>
  (Array.isArray(students) ? students : []).filter((student) => !enrolledIds?.has?.(student._id));

export const summarizeEnrollResult = ({ requested = 0, modified = 0 } = {}) => {
  const requestedCount = Math.max(0, Number(requested) || 0);
  const modifiedCount = Math.max(0, Number(modified) || 0);
  return {
    requested: requestedCount,
    modified: modifiedCount,
    isNone: modifiedCount === 0,
    isPartial: modifiedCount > 0 && modifiedCount < requestedCount
  };
};
