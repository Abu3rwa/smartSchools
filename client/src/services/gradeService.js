import api from '../config/api';

const gradeService = {
    // Add daily grade
    addDailyGrade: async (gradeData) => {
        const response = await api.post('/grades/daily', gradeData);
        return response.data;
    },

    // Bulk add grades
    bulkAddGrades: async (gradesData) => {
        const response = await api.post('/grades/bulk', gradesData);
        return response.data;
    },

    // Add exam grade
    addExamGrade: async (gradeData) => {
        const response = await api.post('/grades/exam', gradeData);
        return response.data;
    },

    // Get student grades
    getStudentGrades: async (studentId, filters = {}) => {
        const response = await api.get(`/grades/student/${studentId}`, { params: filters });
        return response.data;
    },

    // Get student grade report
    getStudentGradeReport: async (studentId, academicYear) => {
        const response = await api.get(`/grades/report/${studentId}`, { params: { academicYear } });
        return response.data;
    },

    // Get monthly average
    getMonthlyAverage: async (studentId, subject, month, academicYear) => {
        const response = await api.get(`/grades/average/monthly/${studentId}`, {
            params: { subject, month, academicYear }
        });
        return response.data;
    },

    // Get semester average
    getSemesterAverage: async (studentId, subject, semester, academicYear) => {
        const response = await api.get(`/grades/average/semester/${studentId}`, {
            params: { subject, semester, academicYear }
        });
        return response.data;
    },

    // Get overall average
    getOverallAverage: async (studentId, academicYear) => {
        const response = await api.get(`/grades/average/overall/${studentId}`, {
            params: { academicYear }
        });
        return response.data;
    },

    // Get class grades
    getClassGrades: async (classId, subject, date) => {
        const response = await api.get(`/grades/class/${classId}`, {
            params: { subject, date }
        });
        return response.data;
    },

    // Update grade
    updateGrade: async (id, gradeData) => {
        const response = await api.put(`/grades/${id}`, gradeData);
        return response.data;
    },

    // Delete grade
    deleteGrade: async (id) => {
        const response = await api.delete(`/grades/${id}`);
        return response.data;
    },

    // Get class statistics
    getClassStatistics: async (classId, subject, academicYear) => {
        const response = await api.get(`/grades/stats/class/${classId}`, {
            params: { subject, academicYear }
        });
        return response.data;
    },

    // Get student grades with date range
    getStudentGradesByDateRange: async (studentId, startDate, endDate, filters = {}) => {
        const params = {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            ...filters
        };
        const response = await api.get(`/grades/student/${studentId}/range`, { params });
        return response.data;
    },

    // Get dashboard statistics
    getDashboardStats: async (academicYear) => {
        const response = await api.get('/grades/dashboard/stats', {
            params: { academicYear }
        });
        return response.data;
    }
};

export default gradeService;
