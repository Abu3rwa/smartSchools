import api from '../config/api';

const BASE = '/communication-email';

export async function fetchCommunicationComposerConfig() {
    const { data } = await api.get(`${BASE}/composer-config`);
    if (!data.success) throw new Error(data.message || 'Failed to load email composer configuration');
    return data.data;
}

export async function fetchCommunicationRecipientSuggestions({ field, query = '', page = 1, limit = 20 }) {
    const params = new URLSearchParams();
    params.set('field', field);
    if (query) params.set('query', query);
    if (page) params.set('page', String(page));
    if (limit) params.set('limit', String(limit));

    const { data } = await api.get(`${BASE}/suggestions?${params.toString()}`);
    if (!data.success) throw new Error(data.message || 'Failed to fetch recipient suggestions');
    return data.data;
}

export async function previewCommunicationRecipients(payload) {
    const { data } = await api.post(`${BASE}/preview`, payload);
    if (!data.success) throw new Error(data.message || 'Failed to preview recipients');
    return data.data;
}

export async function generateCommunicationEmailDraft(payload) {
    const { data } = await api.post(`${BASE}/ai-draft`, payload);
    if (!data.success) throw new Error(data.message || 'Failed to generate AI draft');
    return data.data;
}

export async function sendCommunicationEmail(payload) {
    const { data } = await api.post(`${BASE}/send`, payload);
    if (!data.success) throw new Error(data.message || 'Failed to send communication email');
    return data.data;
}

export async function uploadCommunicationAttachments(files = []) {
    const inputFiles = Array.isArray(files) ? files : [];
    if (inputFiles.length === 0) {
        return { attachments: [] };
    }

    const formData = new FormData();
    inputFiles.forEach((file) => {
        formData.append('attachments', file);
    });

    const { data } = await api.post(`${BASE}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    if (!data.success) throw new Error(data.message || 'Failed to upload attachments');
    return data.data;
}

export async function removeCommunicationAttachment(attachmentId) {
    const { data } = await api.delete(`${BASE}/attachments/${attachmentId}`);
    if (!data.success) throw new Error(data.message || 'Failed to remove attachment');
    return data;
}

const readFilenameFromDisposition = (disposition = '', fallback = 'attachment') => {
    const header = String(disposition || '');
    const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        try {
            return decodeURIComponent(utf8Match[1]);
        } catch {
            return fallback;
        }
    }
    const asciiMatch = header.match(/filename="?([^";]+)"?/i);
    if (asciiMatch?.[1]) return asciiMatch[1];
    return fallback;
};

export async function downloadCommunicationAttachment(attachment) {
    const attachmentId = String(attachment?.id || attachment?._id || '').trim();
    if (!attachmentId) {
        throw new Error('Invalid attachment id');
    }

    const response = await api.get(`${BASE}/attachments/${attachmentId}/download`, {
        responseType: 'blob'
    });

    const fallbackName = String(attachment?.originalName || 'attachment');
    const filename = readFilenameFromDisposition(
        response.headers?.['content-disposition'],
        fallbackName
    );

    const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: attachment?.mimeType || 'application/octet-stream' });

    const objectUrl = window.URL.createObjectURL(blob);
    try {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } finally {
        window.URL.revokeObjectURL(objectUrl);
    }
}

export async function fetchCommunicationEmailHistory({ page = 1, limit = 20 } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    const { data } = await api.get(`${BASE}/history?${params.toString()}`);
    if (!data.success) throw new Error(data.message || 'Failed to fetch communication history');
    return data.data;
}
