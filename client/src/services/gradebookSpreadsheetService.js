import api from '../config/api';

const withNormalizedSubject = (payload = {}) => {
    const normalized = { ...payload };
    if (!normalized.subject && normalized.subjectId) {
        normalized.subject = normalized.subjectId;
    }
    return normalized;
};

const gradebookSpreadsheetService = {
    getSpreadsheetData: async (classId, params = {}) => {
        const response = await api.get(`/grades/spreadsheet/${classId}`, {
            params: withNormalizedSubject(params)
        });
        return response.data;
    },

    batchSaveGrades: async (data) => {
        const response = await api.put('/grades/spreadsheet/batch-save', withNormalizedSubject(data));
        return response.data;
    },

    autoFillColumn: async (data) => {
        const response = await api.post('/grades/auto-fill', withNormalizedSubject(data));
        return response.data;
    },

    importGrades: async (data) => {
        const response = await api.post('/grades/import', data);
        return response.data;
    },

    exportGradebook: async (classId, params = {}) => {
        const response = await api.get(`/grades/export/${classId}`, {
            params: withNormalizedSubject(params)
        });
        return response.data;
    },

    getMissingReport: async (classId, params = {}) => {
        const response = await api.get(`/grades/missing-report/${classId}`, {
            params: withNormalizedSubject(params)
        });
        return response.data;
    }
};

export default gradebookSpreadsheetService;
