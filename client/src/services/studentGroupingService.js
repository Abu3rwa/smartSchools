import api from '../config/api';

const getFilenameFromDisposition = (disposition, fallback = 'student-grouping-report.pdf') => {
    const header = String(disposition || '');
    const match = header.match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i);
    if (!match || !match[1]) return fallback;

    try {
        return decodeURIComponent(match[1].replace(/\"/g, '').trim());
    } catch {
        return match[1].replace(/\"/g, '').trim();
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
    }
};

export default studentGroupingService;