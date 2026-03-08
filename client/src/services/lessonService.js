import api from '../config/api';

const lessonService = {
    // Get all lessons with optional filters
    getLessons: async (params = {}) => {
        const response = await api.get('/lessons', { params });
        return response.data;
    },

    // Get single lesson
    getLesson: async (id) => {
        const response = await api.get(`/lessons/${id}`);
        return response.data;
    },

    // Create lesson
    createLesson: async (lessonData) => {
        const response = await api.post('/lessons', lessonData);
        return response.data;
    },

    // Update lesson
    updateLesson: async (id, lessonData) => {
        const response = await api.put(`/lessons/${id}`, lessonData);
        return response.data;
    },

    // Delete lesson
    deleteLesson: async (id) => {
        const response = await api.delete(`/lessons/${id}`);
        return response.data;
    },

    // Get lesson plan statistics (admin only)
    getLessonPlanStats: async (params = {}) => {
        const response = await api.get('/lessons/stats', { params });
        return response.data;
    },

    // Admin trigger AI evaluation for a lesson
    triggerLessonEvaluation: async (id, payload = {}) => {
        const response = await api.post(`/lessons/${id}/evaluation/trigger`, payload);
        return response.data;
    },

    // Admin fetch AI evaluation history for a lesson
    getLessonEvaluationHistory: async (id, params = {}) => {
        const response = await api.get(`/lessons/${id}/evaluation/history`, { params });
        return response.data;
    },

    // Review lesson plan manually (approve / needs revision / reject)
    reviewLessonPlan: async (id, payload) => {
        const response = await api.post(`/lessons/${id}/review`, payload);
        return response.data;
    }
};

export default lessonService;
