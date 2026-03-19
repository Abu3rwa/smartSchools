import api from '../config/api';

const teacherService = {
    // Get all teachers
    getTeachers: async (params = {}) => {
        const response = await api.get('/teachers', { params });
        return response.data;
    },

    // Get single teacher
    getTeacher: async (id) => {
        const response = await api.get(`/teachers/${id}`);
        return response.data;
    },

    // Create teacher
    createTeacher: async (teacherData) => {
        const response = await api.post('/teachers', teacherData);
        return response.data;
    },

    // Update teacher
    updateTeacher: async (id, teacherData) => {
        const response = await api.put(`/teachers/${id}`, teacherData);
        return response.data;
    },

    // Delete teacher
    deleteTeacher: async (id) => {
        const response = await api.delete(`/teachers/${id}`);
        return response.data;
    },

    // Assign multiple classes to teacher
    assignMultipleClasses: async (id, assignments) => {
        const response = await api.post(`/teachers/${id}/assign-classes`, {
            assignments
        });
        return response.data;
    },

    // Remove class assignment
    removeClassAssignment: async (teacherId, assignmentId) => {
        const response = await api.delete(`/teachers/${teacherId}/remove-class/${assignmentId}`);
        return response.data;
    },

    // Get my classes (for logged-in teacher)
    getMyClasses: async () => {
        const response = await api.get('/teachers/my-classes');
        return response.data;
    },

    // Get dashboard analytics for logged-in teacher
    getMyDashboardAnalytics: async (params = {}) => {
        const response = await api.get('/teachers/my-dashboard-analytics', { params });
        return response.data;
    },

    importTeachers: async (teachers, options = {}) => {
        const response = await api.post('/teachers/import', {
            teachers,
            ...options
        });
        return response.data;
    }
};

export default teacherService;
