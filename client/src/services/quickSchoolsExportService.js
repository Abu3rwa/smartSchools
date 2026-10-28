import api from '../config/api';

const quickSchoolsExportService = {
    listProfiles: async (params = {}) => {
        const response = await api.get('/export-profiles', { params });
        return response.data;
    },

    createProfile: async (data) => {
        const response = await api.post('/export-profiles', data);
        return response.data;
    },

    updateProfile: async (id, data) => {
        const response = await api.put(`/export-profiles/${id}`, data);
        return response.data;
    },

    deleteProfile: async (id) => {
        const response = await api.delete(`/export-profiles/${id}`);
        return response.data;
    },

    preview: async (body) => {
        const response = await api.post('/gradebook-export/preview', body);
        return response.data;
    },

    download: async (body) => {
        const response = await api.post('/gradebook-export/xlsx', body, { responseType: 'blob' });
        return response;
    }
};

export default quickSchoolsExportService;
