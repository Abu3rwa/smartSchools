import api from '../config/api';

const safeFilenamePart = (value) => String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export const downloadStudentSpellingDetailsDocx = async ({ studentId, firstName, lastName, locale }) => {
    const response = await api.get(`/spelling/students/${studentId}/details/docx`, {
        params: { locale },
        responseType: 'blob'
    });
    const blobUrl = window.URL.createObjectURL(response.data);
    const studentName = [safeFilenamePart(firstName), safeFilenamePart(lastName)].filter(Boolean).join('-') || 'student';
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `spelling-report-${studentName}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
};
