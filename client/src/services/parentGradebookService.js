import api from '../config/api';

const parentGradebookService = {
    getChildren: async () => {
        const response = await api.get('/parent/children');
        return response.data;
    },

    getGrades: async (studentId, params = {}) => {
        const response = await api.get(`/parent/grades/${studentId}`, { params });
        return response.data;
    },

    getProgress: async (studentId, params = {}) => {
        const response = await api.get(`/parent/progress/${studentId}`, { params });
        return response.data;
    },

    getReportCards: async (studentId, params = {}) => {
        const response = await api.get(`/parent/report-cards/${studentId}`, { params });
        return response.data;
    }
};

export default parentGradebookService;
