import api from '../config/api.js';

const unwrap = (response) => response?.data?.data ?? response?.data;

/** Super admin only: platform markup and cross-school AI usage. */
export const platformAiCreditService = {
  getOverview: (params) => api.get('/platform/ai-credit', { params }).then(unwrap),
  updateMarkup: (markupPercent) =>
    api.patch('/platform/ai-credit/settings', { markupPercent }).then(unwrap),
  getSchools: () => api.get('/platform/ai-credit/schools').then(unwrap),
  fundSchool: (schoolId, body) =>
    api.post(`/platform/ai-credit/schools/${schoolId}/fund`, body).then(unwrap),
  grantTeacher: (schoolId, userId, body) =>
    api.post(`/platform/ai-credit/schools/${schoolId}/teachers/${userId}/grant`, body).then(unwrap),
  decideRequest: (requestId, body) =>
    api.post(`/platform/ai-credit/requests/${requestId}/decide`, body).then(unwrap),
};

export default platformAiCreditService;
