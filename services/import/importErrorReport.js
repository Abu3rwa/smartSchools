const CSV_SEPARATOR = ',';

const escapeCsv = (value) => {
    if (value === undefined || value === null) return '';
    const text = String(value);
    if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(CSV_SEPARATOR)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const jsonSafeStringify = (value) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

export const buildErrorReportPath = (importRunId) => `/api/import/runs/${importRunId}/error-report`;

export const buildImportErrorReportCsv = ({ rows = [], errors = [] }) => {
    if (!Array.isArray(errors) || errors.length === 0) return null;

    const errorsByRow = new Map();
    for (const issue of errors) {
        const rowNumber = Number(issue?.row);
        if (!Number.isFinite(rowNumber) || rowNumber <= 0) continue;
        if (!errorsByRow.has(rowNumber)) errorsByRow.set(rowNumber, []);
        errorsByRow.get(rowNumber).push(issue);
    }

    const allRowKeys = new Set();
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        for (const key of Object.keys(row)) allRowKeys.add(key);
    }
    for (const issue of errors) {
        if (issue?.data && typeof issue.data === 'object' && !Array.isArray(issue.data)) {
            for (const key of Object.keys(issue.data)) allRowKeys.add(key);
        }
    }

    const dataColumns = [...allRowKeys];
    const header = ['row', 'field', 'code', 'message', ...dataColumns];
    const lines = [header.map(escapeCsv).join(CSV_SEPARATOR)];

    const sortedRows = [...errorsByRow.keys()].sort((a, b) => a - b);
    for (const rowNumber of sortedRows) {
        const rowIssues = errorsByRow.get(rowNumber) || [];
        const sourceRow = rows[rowNumber - 1] || {};
        for (const issue of rowIssues) {
            const issueRowData = issue?.data && typeof issue.data === 'object' && !Array.isArray(issue.data)
                ? issue.data
                : {};
            const merged = { ...sourceRow, ...issueRowData };
            const line = [
                rowNumber,
                issue?.field || 'row',
                issue?.code || 'UNKNOWN',
                issue?.message || 'Unknown import error',
                ...dataColumns.map((column) => jsonSafeStringify(merged[column]))
            ];
            lines.push(line.map(escapeCsv).join(CSV_SEPARATOR));
        }
    }

    return lines.join('\n');
};
