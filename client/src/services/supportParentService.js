import api from "../config/api.js";
import { unwrapEnvelope } from "../utils/apiEnvelope.js";

const unwrap = unwrapEnvelope;

const parentSupportService = {
  getOverview: async () => unwrap(api.get("/parent/support")),
  checkIn: async (planId, body) =>
    unwrap(api.post(`/parent/support/plans/${planId}/checkins`, body)),
  saveSurvey: async (surveyId, answers, expectedRevision) =>
    unwrap(api.put(`/parent/support/surveys/${surveyId}/answers`, { answers, expectedRevision })),
  submitSurvey: async (surveyId, answers, expectedRevision) =>
    unwrap(api.post(`/parent/support/surveys/${surveyId}/submit`, { answers, expectedRevision })),
  noConcerns: async (surveyId) =>
    unwrap(api.post(`/parent/support/surveys/${surveyId}/no-concerns`)),
  skipSurvey: async (surveyId, reason) =>
    unwrap(api.post(`/parent/support/surveys/${surveyId}/skip`, { reason })),
  requestSupport: async (body) => unwrap(api.post("/parent/support/requests", body)),
  history: async (studentId) =>
    unwrap(api.get(`/parent/support/students/${studentId}/history`)),
};

export default parentSupportService;
