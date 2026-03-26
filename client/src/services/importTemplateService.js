import api from '../config/api';

const getFilenameFromDisposition = (disposition, fallback = 'sample.csv') => {
    const header = String(disposition || '');
    const match = header.match(/filename="?([^";]+)"?/i);
    return (match && match[1]) ? match[1] : fallback;
};

const triggerBrowserDownload = ({ blob, filename }) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
};

const importTemplateService = {
    async listEntities() {
        const response = await api.get('/import/templates/entities');
        return response.data?.data?.entities || [];
    },

    async getEntityTemplate(entityType) {
        const response = await api.get(`/import/templates/${entityType}`);
        return response.data?.data?.template || null;
    },

    async downloadEntityTemplate(entityType) {
        const response = await api.get(`/import/templates/${entityType}/download`, {
            responseType: 'blob'
        });
        const filename = getFilenameFromDisposition(
            response.headers?.['content-disposition'],
            `${entityType}-sample.csv`
        );
        triggerBrowserDownload({ blob: response.data, filename });
        return { filename };
    },

    async listAdminTemplates() {
        const response = await api.get('/import/templates/admin');
        return response.data?.data?.templates || [];
    },

    async createAdminTemplate(formData) {
        const response = await api.post('/import/templates/admin', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data?.data?.template;
    },

    async updateAdminTemplate(id, formData) {
        const response = await api.put(`/import/templates/admin/${id}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data?.data?.template;
    },

    async updateAdminTemplateStatus(id, status) {
        const response = await api.patch(`/import/templates/admin/${id}/status`, { status });
        return response.data?.data?.template;
    },

    async deleteAdminTemplate(id) {
        const response = await api.delete(`/import/templates/admin/${id}`);
        return response.data?.data?.template;
    },

    async downloadAdminTemplate(id, fallbackName = 'import-template.csv') {
        const response = await api.get(`/import/templates/admin/${id}/download`, {
            responseType: 'blob'
        });
        const filename = getFilenameFromDisposition(response.headers?.['content-disposition'], fallbackName);
        triggerBrowserDownload({ blob: response.data, filename });
        return { filename };
    }
};

export default importTemplateService;
