import axios from "axios";
import { API_URL } from "../config/api.js";
import { unwrapEnvelope } from "../utils/apiEnvelope.js";

// Public code-based access must not borrow the authenticated client: a wrong
// code is a 401 and the main client would treat that as an expired session.
const publicApi = axios.create({
  baseURL: API_URL,
  timeout: 45000,
  headers: { "Content-Type": "application/json" },
});

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const unwrap = unwrapEnvelope;

const supportAccessService = {
  resolve: async (code) => unwrap(publicApi.post("/support-access/resolve", { code })),
  hub: async (token) => unwrap(publicApi.get("/support-access/hub", { headers: authHeader(token) })),
  getSurvey: async (token, surveyId) =>
    unwrap(publicApi.get(`/support-access/surveys/${surveyId}`, { headers: authHeader(token) })),
  saveSurvey: async (token, surveyId, answers) =>
    unwrap(publicApi.put(`/support-access/surveys/${surveyId}/answers`, { answers }, { headers: authHeader(token) })),
  submitSurvey: async (token, surveyId, answers) =>
    unwrap(publicApi.post(`/support-access/surveys/${surveyId}/submit`, { answers }, { headers: authHeader(token) })),
  checkIn: async (token, planId, body) =>
    unwrap(publicApi.post(`/support-access/plans/${planId}/checkins`, body, { headers: authHeader(token) })),
};

export default supportAccessService;
