import api from '../config/api';

const classService = {
    // Get all classes
    getClasses: async (params = {}) => {
        const response = await api.get('/classes', { params });
        return response.data;
    },

    // Get single class with students
    getClass: async (id) => {
        const response = await api.get(`/classes/${id}`);
        return response.data;
    },

    // Create class
    createClass: async (classData) => {
        const response = await api.post('/classes', classData);
        return response.data;
    },

    // Update class
    updateClass: async (id, classData) => {
        const response = await api.put(`/classes/${id}`, classData);
        return response.data;
    },

    // Delete class
    deleteClass: async (id) => {
        const response = await api.delete(`/classes/${id}`);
        return response.data;
    },

    // Add subject to class
    addSubjectToClass: async (classId, subjectId, teacherId) => {
        const response = await api.post(`/classes/${classId}/subjects`, { subjectId, teacherId });
        return response.data;
    },

    // Remove subject from class
    removeSubjectFromClass: async (classId, subjectId) => {
        const response = await api.delete(`/classes/${classId}/subjects/${subjectId}`);
        return response.data;
    },

    // Get class statistics
    getClassStats: async (classId) => {
        const response = await api.get(`/classes/${classId}/stats`);
        return response.data;
    }
};

export default classService;
