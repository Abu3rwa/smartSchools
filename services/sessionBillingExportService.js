import { getStudentStatement } from './sessionBillingService.js';
import { getBillingOverview, getBillingReport } from './sessionBillingReportService.js';

// A cell that starts with one of these is executed as a formula by spreadsheet
// apps, so free text is prefixed before it ever reaches the file.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const csvCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const csvTextCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return csvCell(FORMULA_PREFIX.test(text) ? `'${text}` : text);
};

export const csvNumberCell = (value, digits = 2) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return digits === 0 ? String(Math.round(number)) : number.toFixed(digits);
};

const isoDay = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const METHOD_LABELS = {
    cash: 'cash',
    'bank-transfer': 'bank transfer',
    cheque: 'cheque',
    online: 'online',
    other: 'other'
};

const money = (value) => csvNumberCell(value, 2);

export const buildStudentsCsv = (overview = {}) => {
    const currency = overview.settings?.currency || 'USD';
    const header = ['Student', 'Sessions', 'Minutes', 'Charged', 'Paid', 'Balance', 'Currency', 'Last activity'];
    const lines = [header.map(csvCell).join(',')];

    for (const student of overview.students || []) {
        lines.push([
            csvTextCell(student.name),
            csvNumberCell(student.rangeSessions, 0),
            csvNumberCell(student.rangeMinutes, 0),
            money(student.rangeCharged),
            money(student.rangePaid),
            money(student.balance),
            csvCell(currency),
            csvCell(isoDay(student.lastAt))
        ].join(','));
    }
    return lines.join('\r\n');
};

const statementDetail = (entry) => {
    if (entry.kind === 'payment') {
        const method = METHOD_LABELS[entry.method] || entry.method || '';
        const reference = String(entry.reference || '').trim();
        const label = method ? `Payment (${method})` : 'Payment';
        return reference ? `${label} — ${reference}` : label;
    }
    return String(entry.sessionTitle || '').trim() || 'Lesson';
};

export const buildStatementCsv = (statement = {}) => {
    const currency = statement.currency || 'USD';
    const header = ['Date', 'Type', 'Detail', 'Minutes', 'Hourly rate', 'Amount', 'Currency', 'Balance after', 'Status', 'Note'];
    const lines = [header.map(csvCell).join(',')];

    for (const entry of statement.entries || []) {
        const isPayment = entry.kind === 'payment';
        const note = [entry.note, entry.voidReason ? `Void reason: ${entry.voidReason}` : '']
            .filter((part) => String(part || '').trim())
            .join(' · ');
        lines.push([
            csvCell(isoDay(entry.occurredAt)),
            csvCell(isPayment ? 'Payment' : (entry.source === 'manual' ? 'Manual lesson' : 'Lesson')),
            csvTextCell(statementDetail(entry)),
            isPayment ? '' : csvNumberCell(entry.minutes, 0),
            isPayment ? '' : money(entry.hourlyRate),
            money(entry.amount),
            csvCell(currency),
            money(entry.balanceAfter),
            csvCell(entry.status === 'void' ? 'Voided' : 'Active'),
            csvTextCell(note)
        ].join(','));
    }
    return lines.join('\r\n');
};

const slug = (value, fallback) => {
    const text = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return text || fallback;
};

export const exportStudentsCsv = async (schoolId, query = {}) => {
    const overview = await getBillingOverview(schoolId, query);
    const from = isoDay(overview.range.from);
    const to = isoDay(overview.range.to);
    return {
        filename: `session-billing-${from}-to-${to}.csv`,
        csv: buildStudentsCsv(overview)
    };
};

export const exportStatementCsv = async (schoolId, studentId) => {
    const statement = await getStudentStatement(schoolId, studentId);
    return {
        filename: `statement-${slug(statement.student.name, 'student')}-${isoDay(new Date())}.csv`,
        csv: buildStatementCsv(statement)
    };
};


const cellForColumn = (column, row) => {
    const value = row?.[column.key];
    if (value === null || value === undefined) return '';
    if (column.type === 'money') return csvNumberCell(value, 2);
    if (column.type === 'number') return csvNumberCell(value, 0);
    if (column.type === 'date') return csvTextCell(isoDay(value));
    return csvTextCell(value);
};

export const buildReportCsv = (report = {}) => {
    const columns = report.columns || [];
    const lines = [
        columns.map((column) => csvTextCell(column.label)).join(','),
        ...(report.rows || []).map((row) => columns.map((column) => cellForColumn(column, row)).join(','))
    ];
    const totals = report.totals || {};
    const totalLabels = Object.entries(totals)
        .filter(([key, value]) => key !== 'currency' && typeof value === 'number')
        .map(([key, value]) => `${csvTextCell(key)}=${csvNumberCell(value, 2)}`);
    if (totalLabels.length) {
        lines.push('');
        lines.push(['Totals', ...totalLabels].map((value) => csvTextCell(value)).join(','));
    }
    return lines.join('\r\n');
};

export const exportReportCsv = async (schoolId, query = {}) => {
    const report = await getBillingReport(schoolId, query);
    return {
        filename: `session-billing-${slug(report.key, 'report')}-${isoDay(report.range.from)}-to-${isoDay(report.range.to)}.csv`,
        csv: buildReportCsv(report)
    };
};
