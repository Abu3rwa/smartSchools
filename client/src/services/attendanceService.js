import api from '../config/api';

const attendanceService = {
    // Teacher period-based attendance
    getMyTodayPeriods: async () => {
        const response = await api.get('/attendance/my-today');
        return response.data;
    },

    takePeriodAttendance: async (payload) => {
        const response = await api.post('/attendance/take', payload);
        return response.data;
    },

    getTeacherAttendance: async (params = {}) => {
        const response = await api.get('/attendance/teacher', { params });
        return response.data;
    },

    getAdminAttendance: async (params = {}) => {
        const response = await api.get('/attendance/admin', { params });
        return response.data;
    },

    createOrUpdateAttendance: async (payload) => {
        const response = await api.post('/attendance', payload);
        return response.data;
    },

    getAttendanceDetails: async (id) => {
        const response = await api.get(`/attendance/${id}`);
        return response.data;
    },

    exportAttendanceData: async (params = {}) => {
        const response = await api.get('/attendance/export', { params, responseType: 'blob' });
        return response.data;
    }
};

export default attendanceService;
