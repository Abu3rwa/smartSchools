import api from '../config/api';

const windowParams = (window) => (window?.kind === 'all'
    ? { window: 'all' }
    : { window: window?.key });

const spellingAnalysisService = {
    listStudents: async ({ grade, window }) => {
        const response = await api.get('/spelling/analysis/students', {
            params: { ...windowParams(window), ...(grade ? { grade } : {}) }
        });
        return response.data;
    },
    getStudent: async ({ studentId, window }) => {
        const response = await api.get(`/spelling/analysis/students/${studentId}`, {
            params: windowParams(window)
        });
        return response.data;
    },
    runStudent: async ({ studentId, window, language, force = false }) => {
        const response = await api.post(`/spelling/analysis/students/${studentId}/run`, {
            ...windowParams(window),
            language,
            force
        });
        return response.data;
    },
    getCohort: async ({ grade, window }) => {
        const response = await api.get('/spelling/analysis/cohort', {
            params: { ...windowParams(window), grade }
        });
        return response.data;
    },
    explainCohort: async ({ grade, window, language }) => {
        const response = await api.post('/spelling/analysis/cohort/narrative', {
            ...windowParams(window),
            grade,
            language
        });
        return response.data;
    },
    createParentDraft: async ({ studentId, window, language }) => {
        const response = await api.post(`/spelling/analysis/students/${studentId}/parent-draft`, {
            ...windowParams(window),
            language
        });
        return response.data;
    },
    updateParentDraft: async ({ draftId, subject, body }) => {
        const response = await api.patch(`/spelling/analysis/parent-drafts/${draftId}`, { subject, body });
        return response.data;
    },
    sendParentDraft: async (draftId) => {
        const response = await api.post(`/spelling/analysis/parent-drafts/${draftId}/send`);
        return response.data;
    }
};

export default spellingAnalysisService;
