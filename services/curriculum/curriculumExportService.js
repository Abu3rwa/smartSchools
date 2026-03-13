const escapeCsv = (value) => {
    const raw = String(value ?? '');
    if (!/[,"\n]/.test(raw)) return raw;
    return `"${raw.replace(/"/g, '""')}"`;
};

const pdfEscape = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const toIsoDate = (value) => {
    if (!value) return '';
    return new Date(value).toISOString().slice(0, 10);
};

const toText = (value) => (value == null ? '' : value);
const toListText = (value) => (Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean).join(' | ') : '');
const firstNonEmpty = (...values) => values.find((value) => String(value ?? '').trim()) || '';

const buildPdfStream = (lines = []) => {
    const pageLines = lines.slice(0, 60);
    const textOps = ['BT', '/F1 10 Tf', '40 800 Td'];
    pageLines.forEach((line, index) => {
        if (index > 0) textOps.push('0 -13 Td');
        textOps.push(`(${pdfEscape(line)}) Tj`);
    });
    textOps.push('ET');
    return textOps.join('\n');
};

const buildPdfObjects = (stream) => [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj'
];

const buildPdfBodyWithOffsets = (objects) => {
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const object of objects) {
        offsets.push(Buffer.byteLength(pdf, 'utf8'));
        pdf += `${object}\n`;
    }
    return { pdf, offsets };
};

const appendPdfXref = ({ pdf, offsets, objectsCount }) => {
    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objectsCount + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i += 1) {
        pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer << /Size ${objectsCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, 'utf8');
};

const createMinimalPdf = (lines = []) => {
    const stream = buildPdfStream(lines);
    const objects = buildPdfObjects(stream);
    const { pdf, offsets } = buildPdfBodyWithOffsets(objects);
    return appendPdfXref({ pdf, offsets, objectsCount: objects.length });
};

const mapLabels = (map, settings = {}) => {
    const templateLabels = map?.templateSnapshot?.template?.labels || {};
    const terminology = settings?.terminology || {};
    return {
        period: firstNonEmpty(templateLabels.period, terminology.period, 'Period'),
        section: firstNonEmpty(templateLabels.section, terminology.section, 'Section'),
        item: firstNonEmpty(templateLabels.item, terminology.item, 'Item'),
        standards: firstNonEmpty(templateLabels.standards, terminology.standards, 'Standards'),
        skills: firstNonEmpty(templateLabels.skills, 'Skills'),
        learningObjectives: firstNonEmpty(templateLabels.learningObjectives, 'Learning Objectives'),
        performanceTask: firstNonEmpty(templateLabels.performanceTask, terminology.performanceTask, 'Performance Task'),
        notes: firstNonEmpty(templateLabels.notes, 'Notes')
    };
};

const listSections = (map) => {
    if (Array.isArray(map.sections) && map.sections.length > 0) return map.sections;
    if (!Array.isArray(map.units) || map.units.length === 0) return [];

    return [{
        title: 'Instructional Period',
        items: map.units.map((unit, index) => ({
            title: unit.title || `Item ${index + 1}`,
            startWeek: unit.startWeek,
            endWeek: unit.endWeek,
            standards: toListText(String(unit.standards || '').split('|')),
            skills: toListText(String(unit.skills || '').split('|')),
            learningObjectives: toListText(String(unit.studentOutcomes || '').split('|')),
            performanceTasks: toListText(String(unit.performanceTask || '').split('|')),
            notes: unit.notes || ''
        }))
    }];
};

const toWeekText = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    if (number <= 0) return '';
    return String(Math.round(number));
};

const formatDateRange = (startDate, endDate) => {
    if (startDate === '' && endDate === '') return '';
    return `${startDate} - ${endDate}`.trim();
};

const formatWeekRange = (startWeekValue, endWeekValue) => {
    const startWeek = toWeekText(startWeekValue);
    const endWeek = toWeekText(endWeekValue);
    if (startWeek === '' && endWeek === '') return '';
    const values = [startWeek, endWeek].filter(Boolean);
    const first = values[0];
    const second = values[1] || values[0];
    return `W${first}-W${second}`;
};

const toDateRangeText = (item = {}) => {
    const startDate = toIsoDate(item?.dateRange?.startDate);
    const endDate = toIsoDate(item?.dateRange?.endDate);
    const dateRangeText = formatDateRange(startDate, endDate);
    if (dateRangeText !== '') return dateRangeText;
    return formatWeekRange(item.startWeek, item.endWeek);
};

const toStandardsText = (item = {}) => {
    if (Array.isArray(item.standards)) {
        return item.standards
            .map((standard) => standard.code || standard.title || standard.description || '')
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .join(' | ');
    }
    return toText(item.standards);
};

const flattenRows = (map) => {
    const rows = [];
    for (const section of listSections(map)) {
        for (const item of section.items || []) {
            rows.push({
                period: section.title || '',
                section: section.title || '',
                item: item.title || '',
                dateRange: toDateRangeText(item),
                standards: toStandardsText(item),
                skills: toListText(item.skills),
                learningObjectives: toListText(item.learningObjectives),
                performanceTasks: toListText(item.performanceTasks),
                assessment: toText(item.assessment),
                notes: toText(item.notes)
            });
        }
    }
    return rows;
};

const resolveColumnConfig = (map, settings = {}) => {
    const labels = mapLabels(map, settings);
    const columns = {
        period: labels.period,
        section: labels.section,
        item: labels.item,
        dateRange: 'Date Range',
        standards: labels.standards,
        skills: labels.skills,
        learningObjectives: labels.learningObjectives,
        performanceTasks: labels.performanceTask,
        assessment: 'Assessment',
        notes: labels.notes
    };
    const preferred = settings?.exportPreferences?.preferredColumns
        || map?.templateSnapshot?.template?.export?.preferredColumns
        || Object.keys(columns);
    const keys = preferred.filter((key) => columns[key]);
    return { keys, columns };
};

const rowToCsv = (row, keys) => keys.map((key) => escapeCsv(row[key])).join(',');

const mapMetaHtml = (map) => {
    const className = map.classId?.name || `Grade ${map.grade || ''}`;
    const subjectName = map.subject?.name || '';
    return `
        <div class="meta-grid">
            <div><strong>Academic Year:</strong> ${toText(map.academicYear)}</div>
            <div><strong>Class:</strong> ${toText(className)}</div>
            <div><strong>Subject:</strong> ${toText(subjectName)}</div>
            <div><strong>Status:</strong> ${toText(map.status)}</div>
        </div>
    `;
};

const buildHtmlTable = ({ rows, keys, columns }) => {
    const header = keys.map((key) => `<th>${columns[key]}</th>`).join('');
    const body = rows.map((row) => `<tr>${keys.map((key) => `<td>${toText(row[key])}</td>`).join('')}</tr>`).join('');
    return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
};

const toPacingCsvRow = (entry) => [
    toText(entry.weekNumber),
    toIsoDate(entry.startDate),
    toIsoDate(entry.endDate),
    toText(entry.unitRef?.unitTitle),
    toText(entry.focus),
    Array.isArray(entry.objectives) ? entry.objectives.join(' | ') : '',
    toText(entry.assessment),
    toText(entry.notes)
];

const curriculumExportApi = {
    exportCurriculumMapAsCsv(map, settings = {}) {
        const rows = flattenRows(map);
        const { keys, columns } = resolveColumnConfig(map, settings);
        const header = keys.map((key) => escapeCsv(columns[key])).join(',');
        const csvRows = rows.map((row) => rowToCsv(row, keys));
        return [header, ...csvRows].join('\n');
    },

    exportCurriculumMapAsPdf(map, settings = {}) {
        const labels = mapLabels(map, settings);
        const rows = flattenRows(map);
        const lines = [
            `Curriculum Map: ${map.title || ''}`,
            `Academic Year: ${map.academicYear || ''}`,
            `Status: ${map.status || ''}`,
            '',
            `${labels.period} / ${labels.item} Overview`
        ];
        rows.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.period} - ${row.item} (${row.dateRange})`);
            if (row.learningObjectives) lines.push(`   ${labels.learningObjectives}: ${row.learningObjectives}`);
            if (row.performanceTasks) lines.push(`   ${labels.performanceTask}: ${row.performanceTasks}`);
        });
        return createMinimalPdf(lines);
    },

    exportCurriculumMapAsHtml(map, settings = {}) {
        const rows = flattenRows(map);
        const { keys, columns } = resolveColumnConfig(map, settings);
        const table = buildHtmlTable({ rows, keys, columns });

        return `
            <!doctype html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>Curriculum Map - ${toText(map.title)}</title>
                    <style>
                        body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #1f2937; }
                        h1 { margin: 0 0 8px; font-size: 24px; }
                        .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 6px 16px; margin: 12px 0 18px; }
                        table { width: 100%; border-collapse: collapse; font-size: 12px; }
                        th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; text-align: left; }
                        th { background: #f3f4f6; }
                        @media print { body { margin: 0; } }
                    </style>
                </head>
                <body>
                    <h1>${toText(map.title)}</h1>
                    ${mapMetaHtml(map)}
                    ${table}
                </body>
            </html>
        `.trim();
    },

    exportPacingGuideAsCsv(guide) {
        const rows = [['Week', 'Start Date', 'End Date', 'Unit', 'Focus', 'Objectives', 'Assessment', 'Notes']];
        for (const entry of guide.entries || []) rows.push(toPacingCsvRow(entry));
        return rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    },

    exportPacingGuideAsPdf(guide) {
        const lines = [
            `Pacing Guide: ${guide.title || ''}`,
            `Academic Year: ${guide.academicYear || ''}`,
            `Term: ${guide.term || ''}`,
            `Status: ${guide.status || ''}`,
            `Sync: ${guide.syncStatus || ''}`,
            '',
            'Weeks:'
        ];
        (guide.entries || []).forEach((entry) => {
            lines.push(`Week ${entry.weekNumber}: ${entry.unitRef?.unitTitle || entry.focus || ''}`);
        });
        return createMinimalPdf(lines);
    }
};

export const createCurriculumExportService = () => curriculumExportApi;

export const curriculumExportService = createCurriculumExportService();
