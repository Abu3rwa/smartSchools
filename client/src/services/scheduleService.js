import api from '../config/api';

const scheduleService = {
    getSchedules: async (params = {}) => {
        const response = await api.get('/schedules', { params });
        return response.data;
    },

    getSchedulesByDateRange: async (startDate, endDate, params = {}) => {
        const response = await api.get('/schedules/calendar', {
            params: { startDate, endDate, ...params }
        });
        return response.data;
    },

    getTeacherSchedule: async (teacherId, startDate, endDate) => {
        const response = await api.get(`/schedules/teacher/${teacherId}`, {
            params: { startDate, endDate }
        });
        return response.data;
    },

    createSchedule: async (payload) => {
        const response = await api.post('/schedules', payload);
        return response.data;
    },

    updateSchedule: async (id, payload) => {
        const response = await api.put(`/schedules/${id}`, payload);
        return response.data;
    },

    deleteSchedule: async (id) => {
        const response = await api.delete(`/schedules/${id}`);
        return response.data;
    }
};

export default scheduleService;
