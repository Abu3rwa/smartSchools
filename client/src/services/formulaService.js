import api from '../config/api';

const formulaService = {
    getFormulas: async ({ classId, subjectId, academicYear, semester }) => {
        const params = { classId, subjectId, academicYear };
        if (semester) params.semester = semester;
        const response = await api.get('/gradebook-formulas', { params });
        return response.data;
    },

    getFormula: async (id) => {
        const response = await api.get(`/gradebook-formulas/${id}`);
        return response.data;
    },

    createFormula: async (data) => {
        const response = await api.post('/gradebook-formulas', data);
        return response.data;
    },

    updateFormula: async (id, data) => {
        const response = await api.put(`/gradebook-formulas/${id}`, data);
        return response.data;
    },

    deleteFormula: async (id) => {
        const response = await api.delete(`/gradebook-formulas/${id}`);
        return response.data;
    },

    calculateFormula: async (id, studentIds = []) => {
        const response = await api.post(`/gradebook-formulas/${id}/calculate`, { studentIds });
        return response.data;
    },

    getPresets: async () => {
        const response = await api.get('/gradebook-formulas/presets');
        return response.data;
    }
};

export default formulaService;
