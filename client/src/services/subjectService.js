import api from '../config/api';

const subjectService = {
    // Get all subjects
    getSubjects: async (params = {}) => {
        const response = await api.get('/subjects', { params });
        return response.data;
    },

    // Get single subject
    getSubject: async (id) => {
        const response = await api.get(`/subjects/${id}`);
        return response.data;
    },

    // Create subject
    createSubject: async (subjectData) => {
        const response = await api.post('/subjects', subjectData);
        return response.data;
    },

    // Update subject
    updateSubject: async (id, subjectData) => {
        const response = await api.put(`/subjects/${id}`, subjectData);
        return response.data;
    },

    // Delete subject
    deleteSubject: async (id) => {
        const response = await api.delete(`/subjects/${id}`);
        return response.data;
    },

    // Get subjects by grade
    getSubjectsByGrade: async (grade) => {
        const response = await api.get(`/subjects/grade/${grade}`);
        return response.data;
    }
};

export default subjectService;
