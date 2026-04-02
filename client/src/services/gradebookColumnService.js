import api from '../config/api';

const gradebookColumnService = {
    getColumns: async ({ classId, subjectId, academicYear, semester }) => {
        const params = { classId, subjectId, academicYear };
        if (semester) params.semester = semester;
        const response = await api.get('/gradebook-columns', { params });
        return response.data;
    },

    getColumn: async (id) => {
        const response = await api.get(`/gradebook-columns/${id}`);
        return response.data;
    },

    createColumn: async (data) => {
        const response = await api.post('/gradebook-columns', data);
        return response.data;
    },

    updateColumn: async (id, data) => {
        const response = await api.put(`/gradebook-columns/${id}`, data);
        return response.data;
    },

    deleteColumn: async (id, deleteGrades = false) => {
        const response = await api.delete(`/gradebook-columns/${id}`, {
            params: { deleteGrades: deleteGrades ? 'true' : 'false' }
        });
        return response.data;
    },

    reorderColumns: async (order) => {
        const response = await api.patch('/gradebook-columns/reorder', { order });
        return response.data;
    },

    toggleLock: async (id) => {
        const response = await api.patch(`/gradebook-columns/${id}/lock`);
        return response.data;
    },

    migrateColumns: async ({ classId, subjectId, academicYear, semester }) => {
        const response = await api.post('/gradebook-columns/migrate', {
            classId, subjectId, academicYear, semester
        });
        return response.data;
    }
};

export default gradebookColumnService;
