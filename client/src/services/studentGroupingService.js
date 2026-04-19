import api from '../config/api';

const getFilenameFromDisposition = (disposition, fallback = 'student-grouping-report.pdf') => {
    const header = String(disposition || '');
    const match = header.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    if (!match || !match[1]) return fallback;

    try {
        return decodeURIComponent(match[1].replace(/"/g, '').trim());
    } catch {
        return match[1].replace(/"/g, '').trim();
    }
};

const triggerBrowserDownload = ({ blob, filename }) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Delay revoke to avoid browser race conditions with file readers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const triggerBrowserPrint = ({ blob }) => {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = url;

    const cleanup = () => {
        setTimeout(() => {
            try {
                document.body.removeChild(iframe);
            } catch {
                // ignore cleanup race
            }
            URL.revokeObjectURL(url);
        }, 1000);
    };

    iframe.onload = () => {
        try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
        } finally {
            cleanup();
        }
    };

    document.body.appendChild(iframe);
};

const validatePdfBlob = async (blob, contentTypeHeader) => {
    const headerType = String(contentTypeHeader || '').toLowerCase();
    if (headerType.includes('application/pdf')) return;

    const bytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    const isPdfSignature =
        bytes.length >= 5 &&
        bytes[0] === 0x25 && // %
        bytes[1] === 0x50 && // P
        bytes[2] === 0x44 && // D
        bytes[3] === 0x46 && // F
        bytes[4] === 0x2d; // -

    if (!isPdfSignature) {
        throw new Error('Export response is not a valid PDF document.');
    }
};

const getNestedData = (response) => response?.data?.data ?? response?.data ?? {};

const downloadPdfFromResponse = async (response, fallbackFilename) => {
    await validatePdfBlob(response.data, response.headers?.['content-type']);

    const filename = getFilenameFromDisposition(
        response.headers?.['content-disposition'],
        fallbackFilename
    );

    triggerBrowserDownload({
        blob: response.data,
        filename
    });

    return { filename };
};

const studentGroupingService = {
    async exportStandardPdf({ classId, standardId, academicYear, language }) {
        const response = await api.get(`/student-grouping/${classId}/${standardId}/export-pdf`, {
            params: {
                academicYear,
                ...(language ? { language } : {})
            },
            responseType: 'blob'
        });

        return downloadPdfFromResponse(response, 'student-grouping-report.pdf');
    },

    async exportOverviewPdf({ classId, academicYear, subjectId, language }) {
        const response = await api.get(`/student-grouping/${classId}/export-overview-pdf`, {
            params: {
                academicYear,
                ...(subjectId ? { subjectId } : {}),
                ...(language ? { language } : {})
            },
            responseType: 'blob'
        });

        return downloadPdfFromResponse(response, 'student-grouping-overview.pdf');
    },

    async getReportHistory({ classId, page = 1, limit = 10, academicYear, reportType, subjectId }) {
        const response = await api.get(`/student-grouping/${classId}/reports`, {
            params: {
                page,
                limit,
                ...(academicYear ? { academicYear } : {}),
                ...(reportType ? { reportType } : {}),
                ...(subjectId ? { subjectId } : {})
            }
        });

        const data = getNestedData(response);
        return {
            items: Array.isArray(data.items) ? data.items : [],
            pagination: data.pagination || null
        };
    },

    async downloadArchivedReport({ reportId }) {
        const response = await api.get(`/student-grouping/reports/${reportId}/download`, {
            responseType: 'blob'
        });

        return downloadPdfFromResponse(response, 'student-grouping-report.pdf');
    },

    async listWorksheetPacks({ classId, standardId, academicYear, page = 1, limit = 10 }) {
        const response = await api.get(`/student-grouping/${classId}/${standardId}/worksheet-packs`, {
            params: {
                page,
                limit,
                ...(academicYear ? { academicYear } : {})
            }
        });

        const data = getNestedData(response);
        return {
            items: Array.isArray(data.items) ? data.items : [],
            pagination: data.pagination || null
        };
    },

    async createWorksheetPackDraft({ classId, standardId, academicYear, language, title }) {
        const response = await api.post(`/student-grouping/${classId}/${standardId}/worksheet-packs`, {
            academicYear,
            ...(language ? { language } : {}),
            ...(title ? { title } : {})
        });

        return getNestedData(response);
    },

    async endWorksheetPackAuthoring({ packId }) {
        const response = await api.put(`/student-grouping/worksheet-packs/${packId}/end-authoring`);
        return getNestedData(response);
    },

    async publishWorksheetPack({ packId }) {
        const response = await api.put(`/student-grouping/worksheet-packs/${packId}/publish`);
        return getNestedData(response);
    },

    async downloadWorksheetPackPdf({ packId }) {
        const response = await api.get(`/student-grouping/worksheet-packs/${packId}/export-pdf`, {
            responseType: 'blob'
        });

        return downloadPdfFromResponse(response, 'grouping-worksheet-pack.pdf');
    },

    async printWorksheetPackPdf({ packId }) {
        const response = await api.get(`/student-grouping/worksheet-packs/${packId}/print-pdf`, {
            responseType: 'blob'
        });

        await validatePdfBlob(response.data, response.headers?.['content-type']);
        triggerBrowserPrint({ blob: response.data });
        return { success: true };
    }
};

export default studentGroupingService;