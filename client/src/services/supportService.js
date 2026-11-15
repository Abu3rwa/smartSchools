import api from "../config/api.js";
import { unwrapEnvelope } from "../utils/apiEnvelope.js";

const unwrap = unwrapEnvelope;

const supportService = {
  getClasses: async () => unwrap(api.get("/support/classes")),
  getClassScope: async (classId) => unwrap(api.get(`/support/classes/${classId}/scope`)),
  getClassStudents: async (classId) => unwrap(api.get(`/students/class/${classId}`)),

  getSettings: async () => unwrap(api.get("/support/settings")),
  updateSettings: async (patch) => unwrap(api.put("/support/settings", patch)),

  getBank: async (params = {}) => unwrap(api.get("/support/bank", { params })),
  createQuestion: async (body) => unwrap(api.post("/support/bank", body)),
  reviseQuestion: async (questionId, body) => unwrap(api.post(`/support/bank/${questionId}/revise`, body)),
  retireQuestion: async (questionId) => unwrap(api.post(`/support/bank/${questionId}/retire`)),
  approveQuestion: async (questionId) => unwrap(api.post(`/support/bank/${questionId}/approve`)),

  getCases: async (params = {}) => unwrap(api.get("/support/cases", { params })),
  createCase: async (body) => unwrap(api.post("/support/cases", body)),
  getCase: async (caseId) => unwrap(api.get(`/support/cases/${caseId}`)),
  updateCase: async (caseId, patch) => unwrap(api.patch(`/support/cases/${caseId}`, patch)),
  addNote: async (caseId, text) => unwrap(api.post(`/support/cases/${caseId}/notes`, { text })),
  closeCase: async (caseId, body) => unwrap(api.post(`/support/cases/${caseId}/close`, body)),
  addContact: async (caseId, contact) => unwrap(api.post(`/support/cases/${caseId}/contacts`, contact)),
  getEvidence: async (caseId, windowDays = 120) =>
    unwrap(api.get(`/support/cases/${caseId}/evidence`, { params: { windowDays } })),

  getRequests: async () => unwrap(api.get("/support/requests")),
  respondToRequest: async (caseId, body) => unwrap(api.post(`/support/requests/${caseId}/respond`, body)),

  getSuggestions: async () => unwrap(api.get("/support/suggestions")),
  dismissSuggestion: async (body) => unwrap(api.post("/support/suggestions/dismiss", body)),
  confirmSuggestion: async (body) => unwrap(api.post("/support/suggestions/confirm", body)),

  previewReview: async (caseId, planning) => unwrap(api.post(`/support/cases/${caseId}/reviews/preview`, planning)),
  prepareReview: async (caseId, planning) => unwrap(api.post(`/support/cases/${caseId}/reviews/prepare`, planning)),
  getReview: async (caseId, reviewId) => unwrap(api.get(`/support/cases/${caseId}/reviews/${reviewId}`)),
  issueReview: async (caseId, reviewId) => unwrap(api.post(`/support/cases/${caseId}/reviews/${reviewId}/issue`)),
  retryReview: async (caseId, reviewId) => unwrap(api.post(`/support/cases/${caseId}/reviews/${reviewId}/retry`)),
  cancelReview: async (caseId, reviewId, reason) =>
    unwrap(api.post(`/support/cases/${caseId}/reviews/${reviewId}/cancel`, { reason })),
  printSlips: async (caseId, reviewId) => api.get(`/support/cases/${caseId}/reviews/${reviewId}/slips`),
  markHandedOver: async (caseId, surveyId) =>
    unwrap(api.post(`/support/cases/${caseId}/surveys/${surveyId}/handed-over`)),
  assistedResponse: async (caseId, surveyId, answers) =>
    unwrap(api.post(`/support/cases/${caseId}/surveys/${surveyId}/assisted`, { answers })),

  getVersions: async (caseId) => unwrap(api.get(`/support/cases/${caseId}/plan/versions`)),
  draftPlan: async (caseId, body = {}) => unwrap(api.post(`/support/cases/${caseId}/plan/draft`, body)),
  updateVersion: async (caseId, versionId, revision, patch) =>
    unwrap(api.patch(`/support/cases/${caseId}/plan/versions/${versionId}`, { revision, patch })),
  approveVersion: async (caseId, versionId) =>
    unwrap(api.post(`/support/cases/${caseId}/plan/versions/${versionId}/approve`)),
  publishVersion: async (caseId, versionId) =>
    unwrap(api.post(`/support/cases/${caseId}/plan/versions/${versionId}/publish`)),
  setGoalOutcome: async (caseId, versionId, goalId, body) =>
    unwrap(api.post(`/support/cases/${caseId}/plan/versions/${versionId}/goals/${goalId}/outcome`, body)),
  checkIn: async (caseId, body) => unwrap(api.post(`/support/cases/${caseId}/checkins`, body)),

  getIntegration: async () => unwrap(api.get("/support/integration")),
  getNewsletterSummary: async (caseId) => unwrap(api.get(`/support/cases/${caseId}/newsletter-summary`)),
  addObservation: async (caseId, body) => unwrap(api.post(`/support/cases/${caseId}/observations`, body)),

  getReport: async (params = {}) => unwrap(api.get("/support/reports", { params })),
  getReportCsv: async (params = {}) =>
    api.get("/support/reports/csv", { params, responseType: "blob" }),

  history: async (studentId) => unwrap(api.get(`/support/students/${studentId}/history`)),
};

export default supportService;
