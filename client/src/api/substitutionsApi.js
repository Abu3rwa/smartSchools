import api from '../config/api';

const BASE = '/substitutions';

/**
 * Fetch substitution candidates for an absent teacher on a date.
 * @param {{ absentTeacherId: string, date: string }} payload
 * @returns {Promise<{ date, absentTeacherId, targetPeriods, candidatesAllPeriods, candidatesByPeriod }>}
 */
export async function fetchCandidates({ absentTeacherId, date }) {
  const { data } = await api.post(`${BASE}/candidates`, { absentTeacherId, date });
  if (!data.success) throw new Error(data.message || 'Failed to fetch candidates');
  return data.data;
}

/**
 * Create a substitution request.
 * @param {Object} payload
 * @returns {Promise<{ _id, status, ... }>}
 */
export async function createSubRequest(payload) {
  const { data } = await api.post(BASE, payload);
  if (!data.success) throw new Error(data.message || 'Failed to create request');
  return data.data;
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
 * Respond to a substitution request (confirm/decline) via token.
 * @param {{ token: string, action: 'CONFIRM'|'DECLINE', note?: string }} payload
 * @returns {Promise<Object>}
 */
export async function respondToSubRequest({ token, action, note }) {
  const { data } = await api.post(`${BASE}/respond`, { token, action, note });
  if (!data.success) throw new Error(data.message || 'Failed to respond');
  return data.data;
}
