import api from '../config/api';

const analyticsService = {
    getStudentAnalytics: async (studentId, params = {}) => {
        const response = await api.get(`/analytics/student/${studentId}`, { params });
        return response.data;
    },

    getClassAnalytics: async (classId, params = {}) => {
        const response = await api.get(`/analytics/class/${classId}`, { params });
        return response.data;
    },

    getSchoolAnalytics: async (params = {}) => {
        const response = await api.get('/analytics/school', { params });
        return response.data;
    }
};

export default analyticsService;
