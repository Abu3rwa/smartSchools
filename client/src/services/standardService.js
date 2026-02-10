import api from '../config/api';

const standardService = {
    // Get all standards
    getStandards: async (params = {}) => {
        const response = await api.get('/standards', { params });
        return response.data;
    },

    // Get single standard
    getStandard: async (id) => {
        const response = await api.get(`/standards/${id}`);
        return response.data;
    },

    // Create standard
    createStandard: async (data) => {
        const response = await api.post('/standards', data);
        return response.data;
    },

    // Update standard
    updateStandard: async (id, data) => {
        const response = await api.put(`/standards/${id}`, data);
        return response.data;
    },

    // Delete standard
    deleteStandard: async (id) => {
        const response = await api.delete(`/standards/${id}`);
        return response.data;
    },

    // Bulk import standards
    importStandards: async (standards) => {
        const response = await api.post('/standards/import', { standards });
        return response.data;
    },

    // Get standards grouped by subject
    getStandardsBySubject: async (params = {}) => {
        const response = await api.get('/standards/by-subject', { params });
        return response.data;
    },

    // --- Assignments ---

    // Get assignments
    getAssignments: async (params = {}) => {
        const response = await api.get('/standard-assignments', { params });
        return response.data;
    },

    // Get single assignment with student progress
    getAssignment: async (id) => {
        const response = await api.get(`/standard-assignments/${id}`);
        return response.data;
    },

    // Create assignment
    createAssignment: async (data) => {
        const response = await api.post('/standard-assignments', data);
        return response.data;
    },

    // Update assignment
    updateAssignment: async (id, data) => {
        const response = await api.put(`/standard-assignments/${id}`, data);
        return response.data;
    },

    // Delete assignment
    deleteAssignment: async (id) => {
        const response = await api.delete(`/standard-assignments/${id}`);
        return response.data;
    }
};

export default standardService;
