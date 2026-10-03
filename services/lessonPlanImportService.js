import { parse } from 'csv-parse/sync';
import LessonPlan from '../models/LessonPlan.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Standard from '../models/Standard.js';
import User from '../models/User.js';

export const MAX_IMPORT_ROWS = 500;
export const MAX_STAGES = 6;

const TEXT_FIELDS = {
    summary: 'summary',
    description: 'description',
    previous_knowledge: 'previousKnowledge',
    teaching_objectives: 'teachingObjectives',
    learning_objectives: 'learningObjectives',
    vocabulary: 'vocabulary',
    character_trait_links: 'characterTraitLinks',
    tech_integration: 'techIntegration',
    activities: 'activities',
    assessment_methods: 'assessmentMethods',
    resources: 'resources',
    differentiation: 'differentiation',
    homework: 'homework',
    notes: 'notes',
    topic: 'topic'
};

export const TEMPLATE_HEADERS = [
    'title', 'date', 'class', 'subject', 'teacher_email', 'week_number', 'topic',
    'summary', 'description', 'previous_knowledge', 'teaching_objectives', 'learning_objectives',
    'objectives', 'standards', 'vocabulary', 'character_trait_links', 'tech_integration',
    'activities', 'assessment_methods', 'resources', 'differentiation', 'homework', 'notes',
    ...Array.from({ length: MAX_STAGES }, (_, i) => [
        `stage_${i + 1}_name`, `stage_${i + 1}_procedure`, `stage_${i + 1}_materials`, `stage_${i + 1}_timing`
    ]).flat()
];

const SAMPLE_ROWS = [
    {
        title: 'Introduction to Fractions', date: '2026-10-05', class: 'Grade 5-A', subject: 'Mathematics',
        teacher_email: '', week_number: '5', topic: 'Fractions',
        summary: 'Students learn what a fraction represents.',
        teaching_objectives: 'Identify numerator and denominator; Compare simple fractions',
        objectives: 'Identify numerator and denominator; Compare simple fractions',
        standards: '', vocabulary: 'fraction; numerator; denominator',
        homework: 'Worksheet page 12', notes: '',
        stage_1_name: 'Warm-up', stage_1_procedure: 'Pizza slices discussion', stage_1_materials: 'Slides', stage_1_timing: '10 min',
        stage_2_name: 'Main activity', stage_2_procedure: 'Fraction strips in pairs', stage_2_materials: 'Fraction strips', stage_2_timing: '25 min'
    },
    {
        title: 'الكسور العادية', date: '2026-10-06', class: 'Grade 5-A', subject: 'Mathematics',
        stage_1_name: 'تمهيد', stage_1_procedure: 'مناقشة قصيرة', stage_1_materials: 'عرض تقديمي', stage_1_timing: '10 دقائق'
    }
];

const escapeCsvCell = (value) => {
    let text = String(value ?? '');
    // Neutralise spreadsheet formula injection
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildImportTemplateCsv = () => {
    const lines = [TEMPLATE_HEADERS.join(',')];
    SAMPLE_ROWS.forEach((row) => lines.push(TEMPLATE_HEADERS.map((h) => escapeCsvCell(row[h])).join(',')));
    // BOM so Excel opens Arabic correctly
    return `\uFEFF${lines.join('\r\n')}\r\n`;
};

const normalizeHeader = (header) => String(header ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const HEADER_ALIASES = {
    teacheremail: 'teacher_email',
    email: 'teacher_email',
    week: 'week_number',
    weeknumber: 'week_number',
    classname: 'class',
    subjectname: 'subject',
    previousknowledge: 'previous_knowledge',
    teachingobjectives: 'teaching_objectives',
    learningobjectives: 'learning_objectives',
    charactertraitlinks: 'character_trait_links',
    techintegration: 'tech_integration',
    assessmentmethods: 'assessment_methods'
};

const sanitizeText = (value, max = 5000) => String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);

const splitList = (value) => sanitizeText(value)
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);

const parseDate = (value) => {
    const text = sanitizeText(value, 40);
    if (!text) return null;
    let year; let month; let day;
    let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) {
        [, year, month, day] = match;
    } else {
        // Day-first is the documented rule for non-ISO dates
        match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (!match) return null;
        [, day, month, year] = match;
    }
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
        date.getUTCFullYear() !== Number(year)
        || date.getUTCMonth() !== Number(month) - 1
        || date.getUTCDate() !== Number(day)
    ) return null;
    return date;
};

const key = (value) => sanitizeText(value, 200).toLowerCase();

export const parseLessonPlanCsv = (csvText) => {
    const text = String(csvText ?? '');
    if (!text.trim()) return { rows: [], headers: [], error: 'The CSV file is empty' };

    let records;
    try {
        records = parse(text, {
            columns: (header) => header.map((h) => {
                const normalized = normalizeHeader(h);
                return HEADER_ALIASES[normalized.replace(/_/g, '')] || normalized;
            }),
            bom: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true
        });
    } catch (error) {
        return { rows: [], headers: [], error: `Could not read the CSV file: ${error.message}` };
    }

    const headers = records.length ? Object.keys(records[0]) : [];
    return { rows: records, headers, error: null };
};

/**
 * Reads the first data row of a CSV and returns it shaped like the lesson form.
 * Date, class and subject are not read: the teacher already chose them in the form.
 */
export const parseLessonPlanCsvForForm = async (csvText, schoolId) => {
    const { rows, error } = parseLessonPlanCsv(csvText);
    if (error) return { ok: false, statusCode: 400, message: error };
    if (rows.length === 0) return { ok: false, statusCode: 400, message: 'The CSV file has no data rows' };

    const raw = rows[0];
    const warnings = [];
    if (rows.length > 1) warnings.push(`The file has ${rows.length} rows; only the first one was used`);

    const title = sanitizeText(raw.title, 200);
    if (!title) return { ok: false, statusCode: 400, message: 'The first row has no title' };

    const standards = await Standard.find({ school: schoolId }).select('code name').lean();
    const standardByCode = new Map(standards.map((s) => [key(s.code), s]));
    const manualStandards = [];
    splitList(raw.standards).slice(0, 20).forEach((code) => {
        const found = standardByCode.get(key(code));
        manualStandards.push({ code: (found?.code || code).slice(0, 50), name: found?.name || '', description: '' });
    });

    const stages = [];
    for (let i = 1; i <= MAX_STAGES; i += 1) {
        const stage = {
            name: sanitizeText(raw[`stage_${i}_name`], 200),
            procedure: sanitizeText(raw[`stage_${i}_procedure`]),
            materials: sanitizeText(raw[`stage_${i}_materials`], 1000),
            timing: sanitizeText(raw[`stage_${i}_timing`], 100)
        };
        if (stage.name || stage.procedure || stage.materials || stage.timing) stages.push(stage);
    }

    const text = (column, max = 5000) => sanitizeText(raw[column], max);
    const objectivesText = text('teaching_objectives') || splitList(raw.objectives).join('\n');

    return {
        ok: true,
        warnings,
        fields: {
            title,
            summary: text('summary'),
            description: text('description'),
            homework: text('homework'),
            previousKnowledge: text('previous_knowledge'),
            teachingObjectives: objectivesText,
            vocabulary: text('vocabulary'),
            characterTraitLinks: text('character_trait_links'),
            techIntegration: text('tech_integration'),
            manualStandards,
            stages
        }
    };
};

/**
 * Validates (and optionally commits) lesson plan rows.
 * Teachers always import as themselves; admins may set teacher_email.
 */
export const processLessonPlanImport = async ({
    csv,
    commit = false,
    schoolId,
    user,
    departmentId = null,
    academicYear = null
}) => {
    const { rows, headers, error } = parseLessonPlanCsv(csv);
    if (error) return { ok: false, statusCode: 400, message: error };

    const missingHeaders = ['title', 'date', 'class', 'subject'].filter((h) => !headers.includes(h));
    if (missingHeaders.length) {
        return { ok: false, statusCode: 400, message: `Missing required column(s): ${missingHeaders.join(', ')}` };
    }
    if (rows.length === 0) return { ok: false, statusCode: 400, message: 'The CSV file has no data rows' };
    if (rows.length > MAX_IMPORT_ROWS) {
        return { ok: false, statusCode: 400, message: `A maximum of ${MAX_IMPORT_ROWS} rows can be imported at once` };
    }

    const isAdmin = user.role === 'admin';
    const [classes, subjects, standards] = await Promise.all([
        Class.find({ school: schoolId }).select('name department academicYear').lean(),
        Subject.find({ school: schoolId }).select('name nameAr code').lean(),
        Standard.find({ school: schoolId }).select('code name').lean()
    ]);

    // Same class name can exist in several academic years; prefer the active year
    const classByName = new Map();
    classes.forEach((c) => {
        const k = key(c.name);
        const existing = classByName.get(k);
        const inYear = academicYear && String(c.academicYear) === String(academicYear);
        if (!existing || inYear) classByName.set(k, c);
    });
    const subjectByKey = new Map();
    subjects.forEach((s) => {
        [s.name, s.nameAr, s.code].filter(Boolean).forEach((v) => subjectByKey.set(key(v), s));
    });
    const standardByCode = new Map(standards.map((s) => [key(s.code), s]));

    const teacherEmails = [...new Set(rows
        .map((r) => key(r.teacher_email))
        .filter(Boolean))];
    const teachers = isAdmin && teacherEmails.length
        ? await User.find({
            school: schoolId,
            role: { $in: ['teacher', 'admin'] },
            email: { $in: teacherEmails }
        }).select('email').lean()
        : [];
    const teacherByEmail = new Map(teachers.map((t) => [key(t.email), t]));

    const errors = [];
    const warnings = [];
    const valid = [];
    const seen = new Set();
    let fileDuplicates = 0;

    rows.forEach((raw, index) => {
        const rowNumber = index + 2; // header is row 1
        const addError = (column, message) => errors.push({ row: rowNumber, column, message });
        const addWarning = (column, message) => warnings.push({ row: rowNumber, column, message });
        let rowFailed = false;
        const fail = (column, message) => { rowFailed = true; addError(column, message); };

        const title = sanitizeText(raw.title, 200);
        if (!title) fail('title', 'Title is required');

        const date = parseDate(raw.date);
        if (!date) {
            const received = sanitizeText(raw.date, 40);
            fail('date', received
                ? `Date "${received}" is not valid. Use YYYY-MM-DD (e.g. 2026-10-05) or DD/MM/YYYY`
                : 'Date is empty. Use YYYY-MM-DD (e.g. 2026-10-05) or DD/MM/YYYY');
        }

        const cls = classByName.get(key(raw.class));
        if (!cls) {
            const available = classes.map((c) => c.name).slice(0, 15).join(', ');
            fail('class', `Class "${sanitizeText(raw.class, 80)}" was not found. Available classes: ${available || 'none'}`);
        }
        else if (departmentId && cls.department?.toString() !== departmentId.toString()) {
            fail('class', 'This class is outside your department');
        }

        const subject = subjectByKey.get(key(raw.subject));
        if (!subject) fail('subject', `Subject "${sanitizeText(raw.subject, 80)}" was not found`);

        let teacherId = user._id;
        const requestedEmail = key(raw.teacher_email);
        if (requestedEmail) {
            if (!isAdmin) {
                addWarning('teacher_email', 'Ignored: teachers can only import their own lesson plans');
            } else {
                const teacher = teacherByEmail.get(requestedEmail);
                if (!teacher) fail('teacher_email', `No teacher with email "${requestedEmail}" in this school`);
                else teacherId = teacher._id;
            }
        }

        let weekNumber;
        if (sanitizeText(raw.week_number, 10)) {
            weekNumber = Number(raw.week_number);
            if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 52) {
                addWarning('week_number', 'Week must be a whole number between 1 and 52; ignored');
                weekNumber = undefined;
            }
        }

        const standardIds = [];
        const manualStandards = [];
        splitList(raw.standards).forEach((code) => {
            const found = standardByCode.get(key(code));
            if (found) {
                if (!standardIds.some((id) => id.toString() === found._id.toString())) standardIds.push(found._id);
            } else if (manualStandards.length < 20) {
                manualStandards.push({ code: code.slice(0, 50), name: '', description: '' });
                addWarning('standards', `Standard "${code}" was not found and was added as a manual standard`);
            }
        });

        const stages = [];
        for (let i = 1; i <= MAX_STAGES; i += 1) {
            const stage = {
                name: sanitizeText(raw[`stage_${i}_name`], 200),
                procedure: sanitizeText(raw[`stage_${i}_procedure`]),
                materials: sanitizeText(raw[`stage_${i}_materials`], 1000),
                timing: sanitizeText(raw[`stage_${i}_timing`], 100)
            };
            if (stage.name || stage.procedure || stage.materials || stage.timing) stages.push(stage);
        }
        if (Object.keys(raw).some((h) => /^stage_(\d+)_/.test(h) && Number(h.match(/^stage_(\d+)_/)[1]) > MAX_STAGES)) {
            addWarning('stages', `Only the first ${MAX_STAGES} stages are imported`);
        }

        if (rowFailed) return;

        const duplicateKey = [teacherId, cls._id, subject._id, date.toISOString().slice(0, 10), key(title)].join('|');
        if (seen.has(duplicateKey)) {
            fileDuplicates += 1;
            addWarning('title', 'Duplicate of an earlier row in this file; skipped');
            return;
        }
        seen.add(duplicateKey);

        const doc = {
            school: schoolId,
            teacher: teacherId,
            class: cls._id,
            subject: subject._id,
            date,
            title,
            status: 'draft',
            objectives: splitList(raw.objectives).map((text, order) => ({
                text,
                order,
                standardIds
            })),
            standardIds,
            manualStandards,
            stages
        };
        if (weekNumber) doc.weekNumber = weekNumber;
        Object.entries(TEXT_FIELDS).forEach(([column, field]) => {
            const value = sanitizeText(raw[column], field === 'topic' ? 200 : 5000);
            if (value) doc[field] = value;
        });
        valid.push({ rowNumber, doc, duplicateKey, dayStart: date });
    });

    // Skip rows that already exist in the database
    const duplicates = [];
    if (valid.length) {
        const existing = await LessonPlan.find({
            school: schoolId,
            $or: valid.map(({ doc }) => ({
                teacher: doc.teacher, class: doc.class, subject: doc.subject, date: doc.date
            }))
        }).select('teacher class subject date title').lean();
        const existingKeys = new Set(existing.map((e) => [
            e.teacher, e.class, e.subject, new Date(e.date).toISOString().slice(0, 10), key(e.title)
        ].join('|')));
        valid.forEach((item) => {
            if (existingKeys.has(item.duplicateKey)) duplicates.push(item.rowNumber);
        });
        duplicates.forEach((rowNumber) => warnings.push({
            row: rowNumber,
            column: 'title',
            message: 'A lesson plan with the same teacher, class, subject, date and title already exists; skipped'
        }));
    }
    const importable = valid.filter((item) => !duplicates.includes(item.rowNumber));

    const summary = {
        totalRows: rows.length,
        validRows: importable.length,
        errorRows: new Set(errors.map((e) => e.row)).size,
        skippedDuplicates: duplicates.length + fileDuplicates,
        imported: 0
    };

    if (commit && importable.length) {
        const created = await LessonPlan.insertMany(importable.map(({ doc }) => doc), { ordered: false });
        summary.imported = created.length;
    }

    return {
        ok: true,
        statusCode: 200,
        summary,
        errors,
        warnings,
        sample: importable.slice(0, 5).map(({ rowNumber, doc }) => ({
            row: rowNumber,
            title: doc.title,
            date: doc.date.toISOString().slice(0, 10),
            stages: doc.stages.length,
            objectives: doc.objectives.length
        }))
    };
};
