import api from '../config/api';

const schoolCalendarService = {
    // Legacy school working-days config endpoints
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
    },

    // School calendar events endpoints
    createEvent: async (payload) => {
        const response = await api.post('/calendar/events', payload);
        return response.data;
    },

    updateEvent: async (eventId, payload) => {
        const response = await api.patch(`/calendar/events/${eventId}`, payload);
        return response.data;
    },

    cancelEvent: async (eventId) => {
        const response = await api.patch(`/calendar/events/${eventId}/cancel`);
        return response.data;
    },

    getEventById: async (eventId) => {
        const response = await api.get(`/calendar/events/${eventId}`);
        return response.data;
    },

    listEvents: async (params = {}) => {
        const response = await api.get('/calendar/events', { params });
        return response.data;
    },

    getUpcomingEvents: async (params = {}) => {
        const response = await api.get('/calendar/upcoming', { params });
        return response.data;
    },

    getNotificationPreferences: async () => {
        const response = await api.get('/calendar/notifications/preferences');
        return response.data;
    },

    updateNotificationPreferences: async (payload) => {
        const response = await api.put('/calendar/notifications/preferences', payload);
        return response.data;
    }
};

export default schoolCalendarService;
