import api from "../config/api.js";
import { unwrapEnvelope } from "../utils/apiEnvelope.js";

const unwrap = unwrapEnvelope;

const supportService = {
  getClasses: async () => unwrap(api.get("/support/classes")),
  getClassCycles: async (params) => unwrap(api.get("/support/cycles", { params })),
  createCycles: async (body) => unwrap(api.post("/support/cycles", body)),
  getCycle: async (cycleId) => unwrap(api.get(`/support/cycles/${cycleId}`)),
  addExternalTeacher: async (cycleId, body) =>
    unwrap(api.post(`/support/cycles/${cycleId}/external-teacher`, body)),
  rotateCode: async (cycleId, respondentId) =>
    unwrap(api.post(`/support/cycles/${cycleId}/respondents/${respondentId}/code`)),
  sendInvites: async (cycleId, respondentIds = []) =>
    unwrap(api.post(`/support/cycles/${cycleId}/invite`, { respondentIds })),
  generateDraft: async (cycleId) =>
    unwrap(api.post(`/support/cycles/${cycleId}/plan/draft`)),
  approvePlan: async (cycleId) =>
    unwrap(api.post(`/support/cycles/${cycleId}/plan/approve`)),
  publishPlan: async (cycleId) =>
    unwrap(api.post(`/support/cycles/${cycleId}/plan/publish`)),
  checkIn: async (cycleId, body) =>
    unwrap(api.post(`/support/cycles/${cycleId}/checkins`, body)),
  history: async (studentId) => unwrap(api.get(`/support/students/${studentId}/history`)),
};

export default supportService;
