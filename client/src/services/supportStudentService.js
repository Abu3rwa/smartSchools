import api from "../config/api.js";
import { unwrapEnvelope } from "../utils/apiEnvelope.js";

const unwrap = unwrapEnvelope;

const supportStudentService = {
  listSurveys: async () => unwrap(api.get("/student/support/surveys")),
  getSurvey: async (surveyId) => unwrap(api.get(`/student/support/surveys/${surveyId}`)),
  saveSurvey: async (surveyId, answers, expectedRevision) =>
    unwrap(api.put(`/student/support/surveys/${surveyId}/answers`, { answers, expectedRevision })),
  submitSurvey: async (surveyId, answers, expectedRevision) =>
    unwrap(api.post(`/student/support/surveys/${surveyId}/submit`, { answers, expectedRevision })),
  noConcerns: async (surveyId) =>
    unwrap(api.post(`/student/support/surveys/${surveyId}/no-concerns`)),
  skipSurvey: async (surveyId, reason) =>
    unwrap(api.post(`/student/support/surveys/${surveyId}/skip`, { reason })),
};

export default supportStudentService;
