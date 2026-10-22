import api from '../config/api';

/**
 * Thin transport for the Behavior & Consequence module. Every call returns the
 * already unwrapped `data` payload so the panels never repeat response checks.
 */

const BASE = '/behavior';

const unwrap = (response) => response?.data?.data ?? null;

const get = async (path, params) => unwrap(await api.get(path, { params }));
const post = async (path, body) => unwrap(await api.post(path, body));
const patch = async (path, body) => unwrap(await api.patch(path, body));
const put = async (path, body) => unwrap(await api.put(path, body));

// The settings pair is the only one reachable while the module is switched off.
export const fetchBehaviorSettings = () => get(`${BASE}/settings`);
export const saveBehaviorSettings = (patchBody) => patch(`${BASE}/settings`, patchBody);

export const previewBehaviorSuggestion = (params) => get(`${BASE}/suggestion/preview`, params);
export const logBehaviorIncident = (body) => post(`${BASE}/incidents`, body);
export const mergeBehaviorIncident = (body) => post(`${BASE}/incidents/merge`, body);
export const fetchBehaviorIncidents = (params) => get(`${BASE}/incidents`, params);
export const fetchBehaviorIncidentBundle = (incidentId) => get(`${BASE}/incidents/${incidentId}`);
export const fetchBehaviorIncidentAudit = (incidentId, params) => get(`${BASE}/incidents/${incidentId}/audit`, params);
export const decideBehaviorApproval = (incidentId, body) => post(`${BASE}/incidents/${incidentId}/approval`, body);
export const voidBehaviorIncident = (incidentId, body) => post(`${BASE}/incidents/${incidentId}/void`, body);
export const fetchPendingApprovals = (params) => get(`${BASE}/approvals/pending`, params);

export const fetchBehaviorTasks = (params) => get(`${BASE}/tasks`, params);
export const verifyBehaviorTask = (taskId, body) => post(`${BASE}/tasks/${taskId}/verify`, body);

export const fetchBehaviorTypes = (params) => get(`${BASE}/types`, params);
export const createBehaviorType = (body) => post(`${BASE}/types`, body);
export const updateBehaviorType = (typeId, body) => patch(`${BASE}/types/${typeId}`, body);

export const fetchBehaviorLadders = () => get(`${BASE}/ladders`);
export const fetchBehaviorLadder = (ladderId) => get(`${BASE}/ladders/${ladderId}`);
export const createBehaviorLadder = (body) => post(`${BASE}/ladders`, body);
export const replaceBehaviorLadder = (ladderId, body) => put(`${BASE}/ladders/${ladderId}`, body);

export const fetchBehaviorTemplates = () => get(`${BASE}/templates`);
export const saveBehaviorTemplate = (body) => post(`${BASE}/templates`, body);

export const fetchBehaviorReports = (params) => get(`${BASE}/reports/overview`, params);
export const fetchStudentBehaviorTrend = (studentId, params) => get(`${BASE}/students/${studentId}/trend`, params);
export const fetchStudentReturnStatus = (studentId) => get(`${BASE}/students/${studentId}/return-status`);
export const resetBehaviorCounts = (body) => post(`${BASE}/counts/reset`, body);

export const fetchBehaviorPortalOverview = () => get(`${BASE}/portal/overview`);
export const fetchBehaviorPortalTasks = (params) => get(`${BASE}/portal/tasks`, params);
export const fetchBehaviorPortalIncident = (incidentId) => get(`${BASE}/portal/incidents/${incidentId}`);
export const submitBehaviorPortalTask = (taskId, body) => post(`${BASE}/portal/tasks/${taskId}/submit`, body);
