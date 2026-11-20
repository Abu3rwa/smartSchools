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

// The server slides the 30-minute session by re-signing a token on every
// request (X-Support-Token). Keeping the newest one here — and letting the
// page share the same sessionStorage key — means an actively used session
// never expires, while an abandoned one dies with the old token.
export const SUPPORT_TOKEN_KEY = "support.accessToken";

const storedToken = () => {
  try {
    return sessionStorage.getItem(SUPPORT_TOKEN_KEY) || "";
  } catch {
    return "";
  }
};

let activeToken = storedToken();

const setStoredToken = (token) => {
  activeToken = String(token || "");
  try {
    if (activeToken) sessionStorage.setItem(SUPPORT_TOKEN_KEY, activeToken);
    else sessionStorage.removeItem(SUPPORT_TOKEN_KEY);
  } catch {
    // Private-mode storage failures must not break surveys.
  }
};

publicApi.interceptors.response.use((response) => {
  const fresh = response?.headers?.["x-support-token"];
  if (fresh) setStoredToken(fresh);
  return response;
});

const authHeader = (token) => ({
  Authorization: `Bearer ${activeToken || token || storedToken()}`,
});

const unwrap = unwrapEnvelope;

const supportAccessService = {
  resolve: async (code) => {
    const data = await unwrap(publicApi.post("/support-access/resolve", { code }));
    setStoredToken(data?.token || "");
    return data;
  },
  signOut: () => setStoredToken(""),
  hub: async (token) => unwrap(publicApi.get("/support-access/hub", { headers: authHeader(token) })),
  getSurvey: async (token, surveyId) =>
    unwrap(publicApi.get(`/support-access/surveys/${surveyId}`, { headers: authHeader(token) })),
  saveSurvey: async (token, surveyId, answers, expectedRevision) =>
    unwrap(publicApi.put(`/support-access/surveys/${surveyId}/answers`, { answers, expectedRevision }, { headers: authHeader(token) })),
  submitSurvey: async (token, surveyId, answers, expectedRevision) =>
    unwrap(publicApi.post(`/support-access/surveys/${surveyId}/submit`, { answers, expectedRevision }, { headers: authHeader(token) })),
  noConcerns: async (token, surveyId) =>
    unwrap(publicApi.post(`/support-access/surveys/${surveyId}/no-concerns`, {}, { headers: authHeader(token) })),
  skip: async (token, surveyId, reason) =>
    unwrap(publicApi.post(`/support-access/surveys/${surveyId}/skip`, { reason }, { headers: authHeader(token) })),
  reopen: async (token, surveyId) =>
    unwrap(publicApi.post(`/support-access/surveys/${surveyId}/reopen`, {}, { headers: authHeader(token) })),
  checkIn: async (token, planId, body) =>
    unwrap(publicApi.post(`/support-access/plans/${planId}/checkins`, body, { headers: authHeader(token) })),
};

export default supportAccessService;
