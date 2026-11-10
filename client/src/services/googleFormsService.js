import api from '../config/api';

const BASE = '/google-forms';

const googleFormsService = {
    getStatus: async () => (await api.get(`${BASE}/status`)).data,
    getAuthUrl: async () => (await api.get(`${BASE}/auth/url`)).data,
    disconnect: async () => {
        const response = await api.delete(`${BASE}/auth/disconnect`);
        window.dispatchEvent(new Event('google-suite-disconnected'));
        return response.data;
    },
    syncResponses: async (assignmentId) =>
        (await api.post(`${BASE}/assignments/${assignmentId}/sync`)).data,
    getResponses: async (assignmentId) =>
        (await api.get(`${BASE}/assignments/${assignmentId}/responses`)).data,
    gradeResponse: async (assignmentId, submissionId) =>
        (await api.post(`${BASE}/assignments/${assignmentId}/grade`, { submissionId })).data,
    gradeAllResponses: async (assignmentId) =>
        (await api.post(`${BASE}/assignments/${assignmentId}/grade-all`)).data,
    approveResponse: async (assignmentId, payload) =>
        (await api.post(`${BASE}/assignments/${assignmentId}/approve`, payload)).data
};

export default googleFormsService;
