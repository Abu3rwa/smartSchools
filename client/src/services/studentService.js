import api from '../config/api';

const studentService = {
    // Get all students with optional filters
    getStudents: async (params = {}) => {
        const response = await api.get('/students', { params });
        return response.data;
    },

    // Get single student
    getStudent: async (id) => {
        const response = await api.get(`/students/${id}`);
        return response.data;
    },

    // Create student
    createStudent: async (studentData) => {
        const response = await api.post('/students', studentData);
        return response.data;
    },

    // Update student
    updateStudent: async (id, studentData) => {
        const response = await api.put(`/students/${id}`, studentData);
        return response.data;
    },

    // Delete student (soft-delete by default, permanent for inactive when requested)
    deleteStudent: async (id, { permanent = false } = {}) => {
        const response = await api.delete(`/students/${id}`, {
            params: permanent ? { permanent: 'true' } : undefined
        });
        return response.data;
    },

    // Get students by class
    getStudentsByClass: async (classId) => {
        const response = await api.get(`/students/class/${classId}`);
        return response.data;
    },

    // Transfer student
    transferStudent: async (id, newClassId, reason) => {
        const response = await api.put(`/students/${id}/transfer`, { newClassId, reason });
        return response.data;
    }
};

export default studentService;
