import api from '../config/api';

const timetableService = {
    // Periods
    getPeriods: async () => {
        const response = await api.get('/timetable/periods');
        return response.data;
    },

    createPeriod: async (payload) => {
        const response = await api.post('/timetable/periods', payload);
        return response.data;
    },

    updatePeriod: async (id, payload) => {
        const response = await api.put(`/timetable/periods/${id}`, payload);
        return response.data;
    },

    deletePeriod: async (id) => {
        const response = await api.delete(`/timetable/periods/${id}`);
        return response.data;
    },

    // Teacher's own timetable
    getMyTimetable: async () => {
        const response = await api.get('/timetable/my-timetable');
        return response.data;
    },

    // Assignments
    getAssignments: async (params = {}) => {
        const response = await api.get('/timetable/assignments', { params });
        return response.data;
    },

    createAssignment: async (payload) => {
        const response = await api.post('/timetable/assignments', payload);
        return response.data;
    },

    updateAssignment: async (id, payload) => {
        const response = await api.put(`/timetable/assignments/${id}`, payload);
        return response.data;
    },

    deleteAssignment: async (id) => {
        const response = await api.delete(`/timetable/assignments/${id}`);
        return response.data;
    }
};

export default timetableService;
