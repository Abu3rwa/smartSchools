import api from '../config/api';

const notificationService = {
    // Send grade update notification
    sendGradeUpdateNotification: async (studentId, gradeData) => {
        const response = await api.post('/notifications/grade-update', { studentId, gradeData });
        return response.data;
    },

    // Send daily report
    sendDailyReport: async (studentId, date) => {
        const response = await api.post(`/notifications/daily-report/${studentId}`, { date });
        return response.data;
    },

    // Send monthly report
    sendMonthlyReport: async (studentId, month, academicYear) => {
        const response = await api.post(`/notifications/monthly-report/${studentId}`, { month, academicYear });
        return response.data;
    },

    // Send weekly report
    sendWeeklyReport: async (studentId, weekStartDate, weekEndDate) => {
        const response = await api.post(`/notifications/weekly-report/${studentId}`, { weekStartDate, weekEndDate });
        return response.data;
    },

    // Send class notifications
    sendClassNotifications: async (classId, type, data) => {
        const response = await api.post(`/notifications/class/${classId}`, { type, ...data });
        return response.data;
    },

    // Get notification history
    getNotificationHistory: async (params = {}) => {
        const response = await api.get('/notifications', { params });
        return response.data;
    },

    // Get single notification
    getNotification: async (id) => {
        const response = await api.get(`/notifications/${id}`);
        return response.data;
    },

    // Resend notification
    resendNotification: async (id) => {
        const response = await api.post(`/notifications/${id}/resend`);
        return response.data;
    }
};

export default notificationService;
