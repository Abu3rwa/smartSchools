import api from '../config/api.js';

const unwrap = (response) => response?.data?.data ?? response?.data;

/**
 * Writing Assistant client API. Teacher calls hit /writing/assignments*,
 * student calls hit /writing/my* — the student paths never trigger an AI run.
 */
export const writingService = {
  // Teacher: assignment configuration
  listAssignments: (params) => api.get('/writing/assignments', { params }).then(unwrap),
  getAssignment: (assignmentId) => api.get(`/writing/assignments/${assignmentId}`).then(unwrap),
  createAssignment: (body) => api.post('/writing/assignments', body).then(unwrap),
  updateAssignment: (assignmentId, body) =>
    api.patch(`/writing/assignments/${assignmentId}`, body).then(unwrap),
  deactivateAssignment: (assignmentId) =>
    api.delete(`/writing/assignments/${assignmentId}`).then(unwrap),

  // Teacher: templates
  listTemplates: () => api.get('/writing/templates').then(unwrap),
  saveAsTemplate: (assignmentId) =>
    api.post(`/writing/assignments/${assignmentId}/template`).then(unwrap),
  instantiateTemplate: (templateId, body) =>
    api.post(`/writing/templates/${templateId}/instantiate`, body).then(unwrap),

  // Teacher: board and history
  getBoard: (assignmentId, params) =>
    api.get(`/writing/assignments/${assignmentId}/board`, { params }).then(unwrap),
  getProgress: (assignmentId) =>
    api.get(`/writing/assignments/${assignmentId}/progress`).then(unwrap),
  getProjectHistory: (projectId) => api.get(`/writing/projects/${projectId}/history`).then(unwrap),

  // Teacher: assessment and publication (AI routes are rate limited server-side)
  assessDraft: (draftId, body) =>
    api.post(`/writing/drafts/${draftId}/assess`, body || {}).then(unwrap),
  compareDraft: (draftId, body) =>
    api.post(`/writing/drafts/${draftId}/compare`, body || {}).then(unwrap),
  assessAssignment: (assignmentId, body) =>
    api.post(`/writing/assignments/${assignmentId}/assess`, body || {}).then(unwrap),
  saveAssessmentEdits: (assessmentId, body) =>
    api.patch(`/writing/assessments/${assessmentId}`, body || {}).then(unwrap),
  publishAssessment: (assessmentId, body) =>
    api.post(`/writing/assessments/${assessmentId}/publish`, body || {}).then(unwrap),
  overrideProjectStage: (projectId, body) =>
    api.post(`/writing/projects/${projectId}/stage`, body || {}).then(unwrap),
  recordNotebookReview: (projectId, body) =>
    api.post(`/writing/projects/${projectId}/notebook`, body || {}).then(unwrap),

  // Student
  getMyWriting: () => api.get('/writing/my').then(unwrap),
  openProject: (assignmentId) =>
    api.post(`/writing/assignments/${assignmentId}/open`).then(unwrap),
  getProject: (projectId) => api.get(`/writing/projects/${projectId}`).then(unwrap),
  autosave: (projectId, body) =>
    api.put(`/writing/projects/${projectId}/autosave`, body).then(unwrap),
  submit: (projectId, body) => api.post(`/writing/projects/${projectId}/submit`, body).then(unwrap),
  markNotebookWritten: (projectId) =>
    api.post(`/writing/projects/${projectId}/notebook-written`).then(unwrap),
};

export default writingService;
