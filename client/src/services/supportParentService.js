import api from "../config/api.js";
import { unwrapEnvelope } from "../utils/apiEnvelope.js";

const unwrap = unwrapEnvelope;

const parentSupportService = {
  getOverview: async () => unwrap(api.get("/parent/support")),
  checkIn: async (planId, body) =>
    unwrap(api.post(`/parent/support/plans/${planId}/checkins`, body)),
  saveSurvey: async (surveyId, answers) =>
    unwrap(api.put(`/parent/support/surveys/${surveyId}/answers`, { answers })),
  submitSurvey: async (surveyId, answers) =>
    unwrap(api.post(`/parent/support/surveys/${surveyId}/submit`, { answers })),
  history: async (studentId) =>
    unwrap(api.get(`/parent/support/students/${studentId}/history`)),
};

export default parentSupportService;
