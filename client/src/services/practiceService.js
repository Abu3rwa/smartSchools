import api from '../config/api';

const practiceService = {
    // Student: Get my assigned standards
    getMyAssignments: async () => {
        const response = await api.get('/practice/my-assignments');
        return response.data;
    },

    // Student: Generate a practice question
    generateQuestion: async (data) => {
        const response = await api.post('/practice/generate', data);
        return response.data;
    },

    // Student: Submit an answer
    submitAnswer: async (data) => {
        const response = await api.post('/practice/submit', data);
        return response.data;
    },

    // Student: Get practice history for a standard
    getPracticeHistory: async (standardId, params = {}) => {
        const response = await api.get(`/practice/history/${standardId}`, { params });
        return response.data;
    },

    // Teacher/Admin: Get student progress
    getStudentProgress: async (studentId) => {
        const response = await api.get(`/practice/student/${studentId}/progress`);
        return response.data;
    },

    // Teacher/Admin: Get assignment-level progress
    getAssignmentProgress: async (assignmentId) => {
        const response = await api.get(`/practice/assignment/${assignmentId}/progress`);
        return response.data;
    }
};

export default practiceService;
