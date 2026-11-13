import api from '../config/api';
import { printEndpoint, printHtml } from '../utils/printDocument';

const getNestedData = (response) => response?.data?.data ?? response?.data ?? {};

const studentGroupingService = {
    async printStandardReport({ classId, standardId, academicYear, language }) {
        await printEndpoint(`/student-grouping/${classId}/${standardId}/print`, {
            params: {
                academicYear,
                ...(language ? { language } : {})
            }
        });
    },

    async printOverviewReport({ classId, academicYear, subjectId, language }) {
        await printEndpoint(`/student-grouping/${classId}/print-overview`, {
            params: {
                academicYear,
                ...(subjectId ? { subjectId } : {}),
                ...(language ? { language } : {})
            }
        });
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

    /** Archived reports are stored as printable HTML, so they print like a fresh one. */
    async printArchivedReport({ reportId }) {
        const response = await api.get(`/student-grouping/reports/${reportId}/download`, {
            responseType: 'text',
            headers: { Accept: 'text/html' }
        });

        const html = response.data;
        if (typeof html !== 'string' || !html.trim()) {
            throw new Error('The archived report is empty.');
        }
        // Reports archived before printing replaced PDFs cannot render in the print frame.
        if (html.trimStart().startsWith('%PDF')) {
            throw new Error('This report was archived as a PDF. Print a fresh one from the class overview instead.');
        }
        await printHtml(html);
    }
};

export default studentGroupingService;
