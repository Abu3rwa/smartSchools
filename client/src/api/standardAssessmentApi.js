import api from '../config/api';

const BASE = '/standard-assessment';

// ── Feature 1: Pool Library ──

export const fetchPool = async (params = {}) => {
  const response = await api.get(`${BASE}/pool`, { params });
  return response.data.data;
};

export const fetchPoolQuestion = async (poolId, questionId) => {
  const response = await api.get(`${BASE}/pool/${poolId}/questions/${questionId}`);
  return response.data.data;
};

export const createAssessmentFromPool = async (data) => {
  const response = await api.post(`${BASE}/from-pool`, data);
  return response.data.data;
};

// ── Feature 2: Progress Table + Send ──

export const fetchProgressTable = async (params = {}) => {
  const response = await api.get(`${BASE}/progress-table`, { params });
  return response.data.data;
};

export const sendProgressTable = async (data) => {
  const response = await api.post(`${BASE}/progress-table/send`, data);
  return response.data.data;
};

// ── Feature 3: Narrative Reports ──

export const generateNarrative = async (data) => {
  const response = await api.post(`${BASE}/narrative/generate`, data);
  return response.data.data;
};

export const fetchNarrative = async (id) => {
  const response = await api.get(`${BASE}/narrative/${id}`);
  return response.data.data;
};

export const updateNarrative = async (id, data) => {
  const response = await api.patch(`${BASE}/narrative/${id}`, data);
  return response.data.data;
};

export const sendNarrative = async (id, data) => {
  const response = await api.post(`${BASE}/narrative/${id}/send`, data);
  return response.data.data;
};

export const fetchNarratives = async (params = {}) => {
  const response = await api.get(`${BASE}/narratives`, { params });
  return response.data.data;
};

// ── Feature 4: Live Edit + Versioning ──

export const fetchEditImpact = async (assignmentId) => {
  const response = await api.get(`${BASE}/${assignmentId}/edit-impact`);
  return response.data.data;
};

export const patchAssessment = async (assignmentId, data) => {
  const response = await api.patch(`${BASE}/${assignmentId}`, data);
  return response.data.data;
};

export const createRevision = async (assignmentId, data) => {
  const response = await api.post(`${BASE}/${assignmentId}/revisions`, data);
  return response.data.data;
};

export const publishRevision = async (assignmentId, versionNumber) => {
  const response = await api.post(`${BASE}/${assignmentId}/revisions/${versionNumber}/publish`);
  return response.data.data;
};

export const fetchRevisions = async (assignmentId) => {
  const response = await api.get(`${BASE}/${assignmentId}/revisions`);
  return response.data.data;
};

// ── Settings ──

export const fetchSettings = async (section) => {
  const response = await api.get(`${BASE}/settings/${section}`);
  return response.data.data;
};

export const updateSettings = async (section, data) => {
  const response = await api.put(`${BASE}/settings/${section}`, data);
  return response.data.data;
};

// ── Audit Logs ──

export const fetchAuditLogs = async (params = {}) => {
  const response = await api.get(`${BASE}/audit-logs`, { params });
  return response.data.data;
};

export const exportAuditLogs = async (data) => {
  const response = await api.post(`${BASE}/audit-logs/export`, data, {
    responseType: 'blob',
  });
  return response.data;
};
