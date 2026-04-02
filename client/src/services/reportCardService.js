import api from '../config/api';

const reportCardService = {
    generateReportCard: async (data) => {
        const response = await api.post('/report-cards/generate', data);
        return response.data;
    },

    generateBulkReportCards: async (data) => {
        const response = await api.post('/report-cards/generate-bulk', data);
        return response.data;
    },

    getReportCards: async (params = {}) => {
        const response = await api.get('/report-cards', { params });
        return response.data;
    },

    getReportCard: async (id) => {
        const response = await api.get(`/report-cards/${id}`);
        return response.data;
    },

    publishReportCard: async (id) => {
        const response = await api.patch(`/report-cards/${id}/publish`);
        return response.data;
    },

    updateComments: async (id, data) => {
        const response = await api.patch(`/report-cards/${id}/comments`, data);
        return response.data;
    }
};

export default reportCardService;
