import api from '../config/api.js';

const unwrap = (response) => response?.data?.data ?? response?.data;

/**
 * Prepaid AI credit for one school. The same balance pays for every AI feature,
 * so this service is deliberately outside the Writing module.
 */
export const aiCreditService = {
  // The signed-in person: balance, history and asking for more
  getSummary: () => api.get('/ai-credit').then(unwrap),
  getHistory: (params) => api.get('/ai-credit/history', { params }).then(unwrap),
  requestCredit: (body) => api.post('/ai-credit/requests', body).then(unwrap),
  cancelRequest: (requestId) =>
    api.post(`/ai-credit/requests/${requestId}/cancel`).then(unwrap),

  // School admin: every account, its history and the reserve
  listAccounts: () => api.get('/ai-credit/accounts').then(unwrap),
  getAccountHistory: (userId, params) =>
    api.get(`/ai-credit/accounts/${userId}/history`, { params }).then(unwrap),
  allocate: (userId, body) =>
    api.post(`/ai-credit/accounts/${userId}/allocate`, body).then(unwrap),
  reclaim: (userId, body) =>
    api.post(`/ai-credit/accounts/${userId}/reclaim`, body).then(unwrap),
  updateSettings: (userId, body) =>
    api.patch(`/ai-credit/accounts/${userId}`, body).then(unwrap),
  decideRequest: (requestId, body) =>
    api.post(`/ai-credit/requests/${requestId}/decide`, body).then(unwrap),
};

export default aiCreditService;
