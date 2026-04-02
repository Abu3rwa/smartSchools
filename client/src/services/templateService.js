import api from '../config/api';

const templateService = {
    getTemplates: async () => {
        const response = await api.get('/gradebook-templates');
        return response.data;
    },

    getTemplate: async (id) => {
        const response = await api.get(`/gradebook-templates/${id}`);
        return response.data;
    },

    createTemplate: async (data) => {
        const response = await api.post('/gradebook-templates', data);
        return response.data;
    },

    createFromClass: async (data) => {
        const response = await api.post('/gradebook-templates/from-class', data);
        return response.data;
    },

    updateTemplate: async (id, data) => {
        const response = await api.put(`/gradebook-templates/${id}`, data);
        return response.data;
    },

    deleteTemplate: async (id) => {
        const response = await api.delete(`/gradebook-templates/${id}`);
        return response.data;
    },

    applyTemplate: async (id, data) => {
        const response = await api.post(`/gradebook-templates/${id}/apply`, data);
        return response.data;
    }
};

export default templateService;
