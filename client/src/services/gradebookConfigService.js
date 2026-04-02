import api from '../config/api';

const gradebookConfigService = {
    getConfig: async (academicYear) => {
        const params = academicYear ? { academicYear } : {};
        const response = await api.get('/gradebook-config', { params });
        return response.data;
    },

    getCategories: async (academicYear) => {
        const params = academicYear ? { academicYear } : {};
        const response = await api.get('/gradebook-config/categories', { params });
        return response.data;
    },

    createConfig: async (data) => {
        const response = await api.post('/gradebook-config', data);
        return response.data;
    },

    updateConfig: async (id, data) => {
        const response = await api.put(`/gradebook-config/${id}`, data);
        return response.data;
    },

    cloneConfig: async (id, academicYear) => {
        const response = await api.post(`/gradebook-config/${id}/clone`, { academicYear });
        return response.data;
    }
};

export default gradebookConfigService;
