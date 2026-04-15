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

    createAssignment: async (payload, files = []) => {
        if (files.length > 0) {
            const formData = new FormData();
            Object.entries(payload).forEach(([key, value]) => {
                if (value === undefined) return;
                if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
                    formData.append(key, JSON.stringify(value));
                } else {
                    formData.append(key, value);
                }
            });
            files.forEach((file) => formData.append('attachments', file));
            const response = await api.post('/assignments', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            return response.data;
        }
        const response = await api.post('/assignments', payload);
        return response.data;
    },

    updateAssignment: async (id, payload, files = []) => {
        if (files.length > 0 || (payload.removeAttachmentIds && payload.removeAttachmentIds.length > 0)) {
            const formData = new FormData();
            Object.entries(payload).forEach(([key, value]) => {
                if (value === undefined) return;
                if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
                    formData.append(key, JSON.stringify(value));
                } else {
                    formData.append(key, value);
                }
            });
            files.forEach((file) => formData.append('attachments', file));
            const response = await api.put(`/assignments/${id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            return response.data;
        }
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
    },

    getAttachmentUrl: async (assignmentId, attachmentId) => {
        const response = await api.get(`/assignments/${assignmentId}/attachments/${attachmentId}/url`);
        return response.data;
    },

    sendReminder: async (id, payload = {}) => {
        const response = await api.post(`/assignments/${id}/remind`, payload);
        return response.data;
    }
};

export default assignmentService;
