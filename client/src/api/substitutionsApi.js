import api from '../config/api';

const BASE = '/substitutions';

const resolveApiErrorMessage = (error, fallbackMessage) => {
  const serverMessage = error?.response?.data?.message;
  if (serverMessage) return serverMessage;
  return error?.message || fallbackMessage;
};

/**
 * Fetch substitution candidates for an absent teacher on a date.
 * @param {{ absentTeacherId: string, date: string }} payload
 * @returns {Promise<{ date, absentTeacherId, targetPeriods, candidatesAllPeriods, candidatesByPeriod }>}
 */
export async function fetchCandidates({ absentTeacherId, date }) {
  try {
    const { data } = await api.post(`${BASE}/candidates`, { absentTeacherId, date });
    if (!data.success) throw new Error(data.message || 'Failed to fetch candidates');
    return data.data;
  } catch (error) {
    throw new Error(resolveApiErrorMessage(error, 'Failed to fetch candidates'));
  }
}

/**
 * Create a substitution request.
 * @param {Object} payload
 * @returns {Promise<{ _id, status, ... }>}
 */
export async function createSubRequest(payload) {
  try {
    const { data } = await api.post(BASE, payload);
    if (!data.success) throw new Error(data.message || 'Failed to create request');
    return data.data;
  } catch (error) {
    throw new Error(resolveApiErrorMessage(error, 'Failed to create request'));
  }
}

/**
 * Fetch substitution requests with optional filters.
 * @param {{ status?, startDate?, endDate?, absentTeacherId?, substituteTeacherId?, page?, limit? }} filters
 * @returns {Promise<{ requests: Array, pagination: { page, limit, total, pages } }>}
 */
export async function fetchSubRequests(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.absentTeacherId) params.set('absentTeacherId', filters.absentTeacherId);
  if (filters.substituteTeacherId) params.set('substituteTeacherId', filters.substituteTeacherId);
  if (filters.page) params.set('page', filters.page);
  if (filters.limit) params.set('limit', filters.limit);

  const { data } = await api.get(`${BASE}?${params.toString()}`);
  if (!data.success) throw new Error(data.message || 'Failed to fetch requests');
  return data.data;
}

/**
 * Fetch a single substitution request by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function fetchSubRequestById(id) {
  const { data } = await api.get(`${BASE}/${id}`);
  if (!data.success) throw new Error(data.message || 'Failed to fetch request');
  return data.data;
}

/**
 * Cancel a substitution request.
 * @param {{ id: string, note?: string }} payload
 * @returns {Promise<Object>}
 */
export async function cancelSubRequest({ id, note }) {
  const { data } = await api.post(`${BASE}/${id}/cancel`, { note });
  if (!data.success) throw new Error(data.message || 'Failed to cancel request');
  return data.data;
}

/**
 * Fetch pending (SUBMITTED) substitution request count for current user (teachers see own).
 */
export async function fetchSubPendingCount() {
  const { data } = await api.get(`${BASE}?status=SUBMITTED&limit=1`);
  if (!data.success) throw new Error(data.message || 'Failed to fetch');
  return data.data?.pagination?.total ?? 0;
}

/**
 * Fetch substitution analytics for admin/department principal.
 * @param {{ coverageType?: string, departmentId?: string }} filters
 * @returns {Promise<Object>}
 */
export async function fetchSubRequestsAnalytics(filters = {}) {
  const params = new URLSearchParams();
  if (filters.coverageType) params.set('coverageType', filters.coverageType);
  if (filters.departmentId) params.set('departmentId', filters.departmentId);

  const query = params.toString();
  const { data } = await api.get(query ? `${BASE}/analytics?${query}` : `${BASE}/analytics`);
  if (!data.success) throw new Error(data.message || 'Failed to fetch analytics');
  return data.data;
}

/**
 * Respond to a substitution request (confirm/decline) via token.
 * @param {{ token: string, action: 'CONFIRM'|'DECLINE', note?: string }} payload
 * @returns {Promise<Object>}
 */
export async function respondToSubRequest({ token, action, note }) {
  const { data } = await api.post(`${BASE}/respond`, { token, action, note });
  if (!data.success) throw new Error(data.message || 'Failed to respond');
  return data.data;
}

/**
 * Respond to a substitution request in portal as the logged-in teacher.
 * @param {{ id: string, action: 'CONFIRM'|'DECLINE'|'WITHDRAW', note?: string, assignmentId?: string }} payload
 * @returns {Promise<Object>}
 */
export async function respondToSubRequestAuth({ id, action, note, assignmentId }) {
  const { data } = await api.post(`${BASE}/${id}/respond-auth`, { action, note, assignmentId });
  if (!data.success) throw new Error(data.message || 'Failed to respond');
  return data.data;
}
