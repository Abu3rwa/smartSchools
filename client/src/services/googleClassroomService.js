import api from '../config/api';

const BASE = '/google-classroom';

const googleClassroomService = {
    getStatus: async () => {
        const response = await api.get(`${BASE}/status`);
        return response.data;
    },

    getAuthUrl: async () => {
        const response = await api.get(`${BASE}/auth/url`);
        return response.data;
    },

    disconnect: async () => {
        const response = await api.delete(`${BASE}/auth/disconnect`);
        return response.data;
    },

    listCourses: async () => {
        const response = await api.get(`${BASE}/courses`);
        return response.data;
    },

    listMappings: async (params = {}) => {
        const response = await api.get(`${BASE}/mappings`, { params });
        return response.data;
    },

    saveMapping: async (payload) => {
        const response = await api.put(`${BASE}/mappings`, payload);
        return response.data;
    },

    deleteMapping: async (id) => {
        const response = await api.delete(`${BASE}/mappings/${id}`);
        return response.data;
    },

    getLinks: async (assignmentIds = []) => {
        const response = await api.get(`${BASE}/links`, {
            params: { assignmentIds: assignmentIds.join(',') }
        });
        return response.data;
    },

    postAssignment: async (assignmentId) => {
        const response = await api.post(`${BASE}/assignments/${assignmentId}/publish`);
        return response.data;
    },

    retryAssignment: async (assignmentId) => {
        const response = await api.post(`${BASE}/assignments/${assignmentId}/retry`);
        return response.data;
    }
};

export default googleClassroomService;
