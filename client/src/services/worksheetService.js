import api from '../config/api';

const worksheetService = {
    // ─── Worksheet CRUD ─────────────────────────────────────────────────────
    createWorksheet: async (formData) => {
        const res = await api.post('/worksheets', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return res.data;
    },

    getWorksheet: async (id) => {
        const res = await api.get(`/worksheets/${id}`);
        return res.data;
    },

    listWorksheets: async (params = {}) => {
        const res = await api.get('/worksheets', { params });
        return res.data;
    },

    updateWorksheet: async (id, data) => {
        const res = await api.put(`/worksheets/${id}`, data);
        return res.data;
    },

    deleteWorksheet: async (id) => {
        const res = await api.delete(`/worksheets/${id}`);
        return res.data;
    },

    // ─── Answer Key ─────────────────────────────────────────────────────────
    extractAnswerKey: async (id) => {
        const res = await api.post(`/worksheets/${id}/extract-answer-key`);
        return res.data;
    },

    // ─── Submissions ────────────────────────────────────────────────────────
    addSubmission: async (worksheetId, formData) => {
        const res = await api.post(`/worksheets/${worksheetId}/submissions`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return res.data;
    },

    addBatchSubmissions: async (worksheetId, formData) => {
        const res = await api.post(`/worksheets/${worksheetId}/submissions/batch`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return res.data;
    },

    getSubmissions: async (worksheetId) => {
        const res = await api.get(`/worksheets/${worksheetId}/submissions`);
        return res.data;
    },

    assignStudent: async (worksheetId, submissionId, studentId) => {
        const res = await api.put(`/worksheets/${worksheetId}/submissions/${submissionId}/assign`, { studentId });
        return res.data;
    },

    // ─── Processing ─────────────────────────────────────────────────────────
    processSubmission: async (worksheetId, submissionId) => {
        const res = await api.post(`/worksheets/${worksheetId}/submissions/${submissionId}/process`);
        return res.data;
    },

    processAll: async (worksheetId) => {
        const res = await api.post(`/worksheets/${worksheetId}/process-all`);
        return res.data;
    },

    // ─── Override ───────────────────────────────────────────────────────────
    applyOverride: async (submissionId, overrides) => {
        const res = await api.put(`/worksheets/submissions/${submissionId}/override`, { overrides });
        return res.data;
    },

    // ─── Status ─────────────────────────────────────────────────────────────
    updateStatus: async (id, status) => {
        const res = await api.put(`/worksheets/${id}/status`, { status });
        return res.data;
    },

    publishResults: async (id) => {
        const res = await api.post(`/worksheets/${id}/publish`);
        return res.data;
    },

    // ─── Gradebook ──────────────────────────────────────────────────────────
    syncToGradebook: async (id, submissionIds) => {
        const res = await api.post(`/worksheets/${id}/gradebook/sync`, { submissionIds });
        return res.data;
    },

    unlinkGradebook: async (id) => {
        const res = await api.delete(`/worksheets/${id}/gradebook/unlink`);
        return res.data;
    },

    // ─── Configuration ──────────────────────────────────────────────────────
    getConfig: async (scopeType, scopeId) => {
        const res = await api.get('/worksheets/config', { params: { scopeType, scopeId } });
        return res.data;
    },

    updateConfig: async (data) => {
        const res = await api.put('/worksheets/config', data);
        return res.data;
    }
};

export default worksheetService;
