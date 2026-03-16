import api from '../config/api';

const DEFAULT_SCALE_LEVELS = [
    {
        value: 4,
        label: 'Exceeding',
        minPercent: 90,
        maxPercent: 100,
        description: 'Consistently exceeds standard expectations',
        color: '#1f7a4f'
    },
    {
        value: 3,
        label: 'Meeting',
        minPercent: 75,
        maxPercent: 89,
        description: 'Meets standard expectations',
        color: '#2f855a'
    },
    {
        value: 2,
        label: 'Approaching',
        minPercent: 60,
        maxPercent: 74,
        description: 'Approaching standard expectations',
        color: '#d18a39'
    },
    {
        value: 1,
        label: 'Beginning',
        minPercent: 0,
        maxPercent: 59,
        description: 'Beginning progress toward standards',
        color: '#b91c1c'
    }
];

const getNestedData = (response) => response?.data?.data ?? response?.data ?? {};

const getItems = (response) => {
    const data = getNestedData(response);
    return Array.isArray(data.items) ? data.items : [];
};

const sbrService = {
    getDefaultLevels: () => [...DEFAULT_SCALE_LEVELS],

    getScales: async (includeInactive = false) => {
        const response = await api.get('/sbr/scales', { params: { includeInactive } });
        return getItems(response);
    },

    createScale: async (payload) => {
        const response = await api.post('/sbr/scales', payload);
        return getNestedData(response)?.item || null;
    },

    updateScale: async (id, payload) => {
        const response = await api.put(`/sbr/scales/${id}`, payload);
        return getNestedData(response)?.item || null;
    },

    deleteScale: async (id) => {
        const response = await api.delete(`/sbr/scales/${id}`);
        return getNestedData(response);
    },

    setDefaultScale: async (id) => {
        const response = await api.post(`/sbr/scales/${id}/default`);
        return getNestedData(response)?.item || null;
    },

    generateReport: async (payload) => {
        const response = await api.post('/sbr/generate', payload);
        return getNestedData(response);
    },

    generateBulkReports: async (payload) => {
        const response = await api.post('/sbr/generate-bulk', payload);
        return getNestedData(response);
    },

    previewReport: async ({ studentId, classId, period, academicYear }) => {
        const response = await api.get(`/sbr/preview/${studentId}`, {
            params: { classId, period, academicYear },
            responseType: 'text',
            headers: {
                Accept: 'text/html'
            }
        });

        return typeof response.data === 'string' ? response.data : '';
    },

    getReportCards: async (params = {}) => {
        const response = await api.get('/sbr/reports', { params });
        return {
            items: getNestedData(response)?.items || [],
            pagination: getNestedData(response)?.pagination || null
        };
    },

    getReportCard: async (id) => {
        const response = await api.get(`/sbr/reports/${id}`);
        return getNestedData(response)?.reportCard || null;
    },

    publishReportCard: async (id) => {
        const response = await api.post(`/sbr/reports/${id}/publish`);
        return getNestedData(response)?.reportCard || null;
    },

    emailReportCard: async (id, emails = []) => {
        const response = await api.post(`/sbr/reports/${id}/email`, { emails });
        return getNestedData(response);
    },

    deleteReportCard: async (id) => {
        const response = await api.delete(`/sbr/reports/${id}`);
        return getNestedData(response);
    },

    downloadReportCardPdf: async (id, filename = 'report-card.pdf') => {
        const response = await api.get(`/sbr/reports/${id}/pdf`, {
            responseType: 'blob'
        });

        const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
    }
};

export default sbrService;
