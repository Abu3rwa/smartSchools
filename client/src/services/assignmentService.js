import api from '../config/api';

const assignmentService = {
    getAssignmentTypes: async (params = {}) => {
        const response = await api.get('/assignment-types', { params });
        return response.data;
    },

    createAssignmentType: async (payload) => {
        const response = await api.post('/assignment-types', payload);
        return response.data;
    },

    updateAssignmentType: async (id, payload) => {
        const response = await api.put(`/assignment-types/${id}`, payload);
        return response.data;
    },

    getAssignments: async (params = {}) => {
        const response = await api.get('/assignments', { params });
        return response.data;
    },

    getMyAssignments: async (params = {}) => {
        const response = await api.get('/assignments/my', { params });
        return response.data;
    },

    createAssignment: async (payload) => {
        const response = await api.post('/assignments', payload);
        return response.data;
    },

    updateAssignment: async (id, payload) => {
        const response = await api.put(`/assignments/${id}`, payload);
        return response.data;
    },

    deleteAssignment: async (id) => {
        const response = await api.delete(`/assignments/${id}`);
        return response.data;
    },

    publishAssignment: async (id, payload = {}) => {
        const response = await api.post(`/assignments/${id}/publish`, payload);
        return response.data;
    },

    getAssignmentGradebook: async (id) => {
        const response = await api.get(`/assignments/${id}/gradebook`);
        return response.data;
    },

    gradeAssignment: async (id, payload) => {
        const response = await api.post(`/assignments/${id}/grades`, payload);
        return response.data;
    }
};

export default assignmentService;
