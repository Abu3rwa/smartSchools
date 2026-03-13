import api from '../config/api';

const toData = (response) => response?.data?.data ?? {};

const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};

export const curriculumService = {
    async listMaps(params = {}) {
        const response = await api.get('/curriculum-maps', { params });
        return toData(response);
    },

    async listOptions() {
        const response = await api.get('/curriculum-maps/options');
        return toData(response);
    },

    async uploadMapImportSource(mapId, file) {
        const formData = new FormData();
        formData.append('sourceFile', file);
        const response = await api.post(`/curriculum-maps/${mapId}/ai/sources/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return toData(response);
    },

    async importMapSourceFromGoogleDoc(mapId, payload) {
        const response = await api.post(`/curriculum-maps/${mapId}/ai/sources/import-google-doc`, payload);
        return toData(response);
    },

    async listMapImportSources(mapId) {
        const response = await api.get(`/curriculum-maps/${mapId}/ai/sources`);
        return toData(response);
    },

    async getMapImportJob(mapId, jobId) {
        const response = await api.get(`/curriculum-maps/${mapId}/ai/jobs/${jobId}`);
        return toData(response);
    },

    async applyMapImportJob(mapId, jobId, payload) {
        const response = await api.post(`/curriculum-maps/${mapId}/ai/jobs/${jobId}/apply`, payload);
        return toData(response);
    },

    async createMap(payload) {
        const response = await api.post('/curriculum-maps', payload);
        return toData(response);
    },

    async getMapById(mapId) {
        const response = await api.get(`/curriculum-maps/${mapId}`);
        return toData(response);
    },

    async updateMap(mapId, payload) {
        const response = await api.patch(`/curriculum-maps/${mapId}`, payload);
        return toData(response);
    },

    async deleteMap(mapId) {
        const response = await api.delete(`/curriculum-maps/${mapId}`);
        return toData(response);
    },

    async submitMap(mapId) {
        const response = await api.post(`/curriculum-maps/${mapId}/submit-review`);
        return toData(response);
    },

    async reviewMap(mapId, payload) {
        const response = await api.post(`/curriculum-maps/${mapId}/review`, payload);
        return toData(response);
    },

    async publishMap(mapId) {
        const response = await api.post(`/curriculum-maps/${mapId}/publish`);
        return toData(response);
    },

    async transitionMap(mapId, payload) {
        const response = await api.post(`/curriculum-maps/${mapId}/transition`, payload);
        return toData(response);
    },

    async addMapComment(mapId, payload) {
        const response = await api.post(`/curriculum-maps/${mapId}/comments`, payload);
        return toData(response);
    },

    async getMapHistory(mapId) {
        const response = await api.get(`/curriculum-maps/${mapId}/history`);
        return toData(response);
    },

    async createMapVersion(mapId) {
        const response = await api.post(`/curriculum-maps/${mapId}/new-version`);
        return toData(response);
    },

    async cloneMapToYear(mapId, targetAcademicYear) {
        const response = await api.post(`/curriculum-maps/${mapId}/clone-year`, { targetAcademicYear });
        return toData(response);
    },

    async downloadMap(mapId, format = 'csv') {
        const response = await api.get(`/curriculum-maps/${mapId}/export`, {
            params: { format },
            responseType: 'blob'
        });
        const ext = format === 'pdf' ? 'pdf' : format === 'html' ? 'html' : 'csv';
        downloadBlob(response.data, `curriculum-map-${mapId}.${ext}`);
    },

    async listGuides(params = {}) {
        const response = await api.get('/pacing-guides', { params });
        return toData(response);
    },

    async createGuide(payload) {
        const response = await api.post('/pacing-guides', payload);
        return toData(response);
    },

    async updateGuide(guideId, payload) {
        const response = await api.patch(`/pacing-guides/${guideId}`, payload);
        return toData(response);
    },

    async submitGuide(guideId) {
        const response = await api.post(`/pacing-guides/${guideId}/submit-review`);
        return toData(response);
    },

    async reviewGuide(guideId, payload) {
        const response = await api.post(`/pacing-guides/${guideId}/review`, payload);
        return toData(response);
    },

    async publishGuide(guideId) {
        const response = await api.post(`/pacing-guides/${guideId}/publish`);
        return toData(response);
    },

    async reconcileGuide(guideId, payload = { strategy: 'apply_map_diff' }) {
        const response = await api.post(`/pacing-guides/${guideId}/reconcile`, payload);
        return toData(response);
    },

    async downloadGuide(guideId, format = 'csv') {
        const response = await api.get(`/pacing-guides/${guideId}/export`, {
            params: { format },
            responseType: 'blob'
        });
        const ext = format === 'pdf' ? 'pdf' : 'csv';
        downloadBlob(response.data, `pacing-guide-${guideId}.${ext}`);
    },

    async createOverride(payload) {
        const response = await api.post('/pacing-overrides', payload);
        return toData(response);
    },

    async listOverrides(params = {}) {
        const response = await api.get('/pacing-overrides', { params });
        return toData(response);
    },

    async approveOverride(overrideId, note = '') {
        const response = await api.post(`/pacing-overrides/${overrideId}/approve`, { note });
        return toData(response);
    },

    async rejectOverride(overrideId, note = '') {
        const response = await api.post(`/pacing-overrides/${overrideId}/reject`, { note });
        return toData(response);
    },

    async getSettings() {
        const response = await api.get('/curriculum-settings');
        return toData(response);
    },

    async updateSettings(payload) {
        const response = await api.patch('/curriculum-settings', payload);
        return toData(response);
    },

    async listSubjects() {
        const response = await api.get('/subjects');
        return response?.data?.data?.subjects || response?.data?.subjects || [];
    },

    async listClasses(params = {}) {
        const response = await api.get('/classes', { params });
        return response?.data?.data?.classes || response?.data?.classes || [];
    },

    async getGoogleDriveAuthUrl() {
        const response = await api.get('/auth/google-drive/url');
        return response?.data || {};
    },

    async getGoogleDriveStatus() {
        const response = await api.get('/auth/google-drive/status');
        return response?.data || {};
    },

    async disconnectGoogleDrive() {
        const response = await api.delete('/auth/google-drive/disconnect');
        return response?.data || {};
    }
};

export default curriculumService;
