import api from '../config/api';

const schoolCalendarService = {
    getCalendar: async (params = {}) => {
        const response = await api.get('/school-calendar', { params });
        return response.data;
    },

    upsertConfig: async (payload) => {
        const response = await api.put('/school-calendar/config', payload);
        return response.data;
    },

    upsertException: async (date, payload) => {
        const response = await api.put(`/school-calendar/exceptions/${date}`, payload);
        return response.data;
    },

    deleteException: async (date) => {
        const response = await api.delete(`/school-calendar/exceptions/${date}`);
        return response.data;
    }
};

export default schoolCalendarService;
