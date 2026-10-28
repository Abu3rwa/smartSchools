/**
 * Pure helpers for the QuickSchools gradebook import format.
 *
 * The file is a single sheet (`non-Final Grade import`) with one row per student
 * per assignment. Everything QuickSchools matches by name — subject, category,
 * grade level, semester, student — has to be spelled exactly as it is there, so
 * all of that is configuration, never something this module decides.
 */

export const QUICK_SHEET_NAME = 'non-Final Grade import';

// Header spelling is QuickSchools' own, including "Asignment Date".
export const QUICK_SCHOOL_HEADERS = [
    'Student Full Name',
    'Subject Name / Subject Code',
    'Assignment Name / Column Name',
    'Asignment Date',
    'Assignment Category / Column Category',
    'Marks',
    'Total Marks Possible',
    'Grade Level / Class Name',
    'Semester Name',
    'Final Grade (leave blank if not applicable)'
];

export const EXPORT_ROW_FIELDS = [
    'studentFullName',
    'subjectValue',
    'columnName',
    'date',
    'category',
    'marks',
    'totalMarks',
    'gradeLevel',
    'semesterName',
    'finalGrade'
];

// Older grade records use slightly different type names for the same thing.
const GRADE_TYPE_ALIASES = {
    classwork: ['daily'],
    test: ['monthly_test'],
    exam: ['semester_exam'],
    midterm_exam: ['midterm'],
    final_exam: ['final']
};

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const normalizeKey = (value) =>
    String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Rounds to a fixed number of decimals without binary floating point surprises. */
export const roundMark = (value, decimals = 2) => {
    const places = Math.min(4, Math.max(0, Number.isFinite(Number(decimals)) ? Number(decimals) : 2));
    const factor = 10 ** places;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

/** 5 -> "5th Grade", 1 -> "1st Grade", 11 -> "11th Grade". */
export const gradeLevelLabel = (grade) => {
    const number = Number(grade);
    if (!Number.isFinite(number) || number <= 0) return '';
    const lastTwo = number % 100;
    const lastOne = number % 10;
    let suffix = 'th';
    if (lastTwo < 11 || lastTwo > 13) {
        if (lastOne === 1) suffix = 'st';
        else if (lastOne === 2) suffix = 'nd';
        else if (lastOne === 3) suffix = 'rd';
    }
    return `${number}${suffix} Grade`;
};

/** Replaces {MMM}, {MMMM} and {YYYY} with the month/year of the given date. */
export const resolveColumnName = (template, date = new Date()) => {
    const when = date ? new Date(date) : new Date();
    const monthIndex = Number.isNaN(when.getTime()) ? new Date().getMonth() : when.getMonth();
    const year = Number.isNaN(when.getTime()) ? new Date().getFullYear() : when.getFullYear();
    return String(template || '')
        .replace(/\{MMM\}/g, MONTH_NAMES[monthIndex].slice(0, 3))
        .replace(/\{MMMM\}/g, MONTH_NAMES[monthIndex])
        .replace(/\{YYYY\}/g, String(year))
        .replace(/\s+/g, ' ')
        .trim();
};

const entryDate = (entry) => {
    const date = entry?.date ? new Date(entry.date) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
};

const latestEntryDate = (entries) => {
    let latest = null;
    for (const entry of entries) {
        const date = entryDate(entry);
        if (date && (!latest || date > latest)) latest = date;
    }
    return latest;
};

/**
 * The date written to column D for a row. A fixed rule uses the profile date;
 * the latest rule uses the newest graded entry. Without a fixed date set, the
 * newest entry is used so the row still carries a real date.
 */
export const pickEntryDate = (column, entries = []) => {
    if (column?.dateRule === 'latest') return latestEntryDate(entries);
    const fixed = column?.fixedDate ? new Date(column.fixedDate) : null;
    if (fixed && !Number.isNaN(fixed.getTime())) return fixed;
    return latestEntryDate(entries);
};

/**
 * One mark per student per column: entries are normalised to the column's total
 * so items marked out of different maximums average fairly. Entries without a
 * usable mark are never counted as zero.
 */
export const averageMark = (entries, totalMarks, roundTo = 2) => {
    const total = Number(totalMarks);
    if (!Number.isFinite(total) || total <= 0) return null;

    const scored = (entries || []).filter((entry) => {
        // An unmarked entry is "not assessed yet", not a zero.
        if (entry?.marks === null || entry?.marks === undefined || entry?.marks === '') return false;
        const marks = Number(entry.marks);
        const max = Number(entry?.maxMarks);
        return Number.isFinite(marks) && Number.isFinite(max) && max > 0;
    });
    if (!scored.length) return null;

    const sum = scored.reduce((acc, entry) => acc + (Number(entry.marks) / Number(entry.maxMarks)) * total, 0);
    return roundMark(sum / scored.length, roundTo);
};

export const entryMatchesSource = (entry, sourceType) => {
    const key = normalizeKey(sourceType);
    if (!key) return false;
    const category = normalizeKey(entry?.category);
    const gradeType = normalizeKey(entry?.gradeType);
    if (category === key || gradeType === key) return true;
    return (GRADE_TYPE_ALIASES[key] || []).includes(gradeType);
};

export const studentFullName = (student) => {
    const provided = String(student?.fullName || '').trim();
    if (provided) return provided.replace(/\s+/g, ' ');
    return [student?.firstName, student?.lastName]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ');
};

const isoDateKey = (date) => {
    const value = date instanceof Date ? date : new Date(date);
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
};

const withinRange = (date, range) => {
    if (!range?.startDate || !range?.endDate) return true;
    const start = new Date(range.startDate);
    const end = new Date(range.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
    return date >= start && date <= end;
};

const validateProfileShape = (profile, enabledColumns) => {
    const errors = [];
    const warnings = [];

    if (!String(profile?.subjectValue || '').trim()) {
        errors.push({ level: 'error', code: 'subject_required', message: 'Subject is required.' });
    } else if (String(profile.subjectValue).includes(' - ')) {
        warnings.push({
            level: 'warning',
            code: 'subject_combined_label',
            message: `"${profile.subjectValue}" looks like a combined label. Use only the subject name or its code, otherwise QuickSchools cannot match it.`
        });
    }

    if (!String(profile?.gradeLevel || '').trim()) {
        errors.push({ level: 'error', code: 'grade_level_required', message: 'Grade level is required.' });
    }
    if (!String(profile?.semesterName || '').trim()) {
        errors.push({ level: 'error', code: 'semester_name_required', message: 'Semester name is required.' });
    }

    if (!enabledColumns.length) {
        errors.push({ level: 'error', code: 'no_columns', message: 'Choose at least one column to export.' });
    }

    for (const column of enabledColumns) {
        const label = resolveColumnName(column.columnName, column.fixedDate || new Date()) || column.sourceType;
        if (!String(column.columnName || '').trim()) {
            errors.push({ level: 'error', code: 'column_name_required', message: `A name is required for the ${column.sourceType} column.` });
        }
        if (!String(column.category || '').trim()) {
            errors.push({
                level: 'error',
                code: 'category_required',
                message: `QuickSchools category is required for ${label}.`
            });
        }
        if (!(Number(column.totalMarks) > 0)) {
            errors.push({
                level: 'error',
                code: 'total_marks_invalid',
                message: `Total marks for ${label} must be greater than zero.`
            });
        }
    }

    return { errors, warnings };
};

/**
 * Builds the import rows for one profile.
 *
 * @param {object} input
 * @param {object} input.profile       Saved profile values.
 * @param {object[]} input.students    [{ _id, firstName, lastName, externalName }]
 * @param {object[]} input.entries     Grade records for the class/subject.
 * @param {{startDate?: Date, endDate?: Date}|null} [input.semesterRange]
 * @returns {{ rows: object[], warnings: object[], errors: object[] }}
 */
export const buildExportRows = ({ profile, students = [], entries = [], semesterRange = null } = {}) => {
    const enabledColumns = (profile?.columns || []).filter((column) => column && column.enabled !== false);
    const { errors, warnings } = validateProfileShape(profile, enabledColumns);

    const nameSource = profile?.nameSource === 'fullName' ? 'fullName' : 'externalName';
    const skipEmpty = profile?.skipEmpty !== false;
    const roundTo = profile?.roundTo ?? 2;

    const roster = students
        .map((student) => ({
            id: String(student?._id || student?.id || ''),
            fullName: studentFullName(student),
            externalName: String(student?.externalName || '').trim(),
            firstName: student?.firstName,
            lastName: student?.lastName
        }))
        .filter((student) => student.id && student.fullName);

    const namesWithoutExternal = roster.filter((student) => !student.externalName);
    if (nameSource === 'externalName' && namesWithoutExternal.length) {
        warnings.push({
            level: 'warning',
            code: 'external_name_missing',
            message: `${namesWithoutExternal.length} student${namesWithoutExternal.length === 1 ? '' : 's'} have no QuickSchools name; the app name is used instead.`,
            students: namesWithoutExternal.map((student) => student.fullName)
        });
    }

    const rows = [];
    const seen = new Map();
    const outsideRangeByColumn = new Map();

    for (const column of enabledColumns) {
        if (!String(column.columnName || '').trim() || !String(column.category || '').trim() || !(Number(column.totalMarks) > 0)) {
            // Column-level errors are already reported; no usable rows can come from it.
            continue;
        }

        const columnEntries = entries.filter((entry) => entryMatchesSource(entry, column.sourceType));

        if (!columnEntries.length) {
            warnings.push({
                level: 'warning',
                code: 'column_without_data',
                message: `No grades found for ${resolveColumnName(column.columnName, column.fixedDate || new Date())}.`,
                sourceType: column.sourceType
            });
        }

        let columnRowCount = 0;
        const missingStudents = [];

        for (const student of roster) {
            const mine = columnEntries.filter((entry) => String(entry?.student?._id || entry?.student || '') === student.id);

            const usable = mine.filter((entry) => {
                const marks = Number(entry.marks);
                const max = Number(entry.maxMarks);
                const name = nameSource === 'externalName' ? (student.externalName || student.fullName) : student.fullName;
                if (!Number.isFinite(marks) || marks < 0) {
                    errors.push({
                        level: 'error',
                        code: 'invalid_mark',
                        message: `${name} has an invalid mark in ${column.columnName}.`,
                        student: name,
                        sourceType: column.sourceType
                    });
                    return false;
                }
                if (!Number.isFinite(max) || max <= 0) {
                    errors.push({
                        level: 'error',
                        code: 'invalid_max_marks',
                        message: `${name} has a grade with no valid maximum in ${column.columnName}.`,
                        student: name,
                        sourceType: column.sourceType
                    });
                    return false;
                }
                if (marks > max) {
                    errors.push({
                        level: 'error',
                        code: 'marks_exceed_total',
                        message: `${name}'s mark (${marks}) is higher than the maximum (${max}) in ${column.columnName}.`,
                        student: name,
                        sourceType: column.sourceType
                    });
                    return false;
                }
                return true;
            });

            if (!usable.length) {
                if (!skipEmpty) missingStudents.push(student.fullName);
                continue;
            }

            const marks = averageMark(usable, column.totalMarks, roundTo);
            const date = pickEntryDate(column, usable);
            if (marks === null || !date) continue;

            const columnName = resolveColumnName(column.columnName, date);
            const row = {
                studentFullName: nameSource === 'externalName'
                    ? (student.externalName || student.fullName)
                    : student.fullName,
                subjectValue: String(profile.subjectValue || '').trim(),
                columnName,
                date,
                category: String(column.category || '').trim(),
                marks,
                totalMarks: Number(column.totalMarks),
                gradeLevel: String(profile.gradeLevel || '').trim(),
                semesterName: String(profile.semesterName || '').trim(),
                finalGrade: null
            };

            const duplicateKey = `${row.studentFullName}|${row.columnName}|${isoDateKey(row.date)}`;
            if (seen.has(duplicateKey)) {
                errors.push({
                    level: 'error',
                    code: 'duplicate_row',
                    message: `${row.studentFullName} already has a "${row.columnName}" row on the same date. Rename or disable one of the columns.`,
                    student: row.studentFullName,
                    column: row.columnName
                });
            } else {
                seen.set(duplicateKey, true);
            }

            if (!withinRange(row.date, semesterRange)) {
                outsideRangeByColumn.set(columnName, (outsideRangeByColumn.get(columnName) || 0) + 1);
            }

            rows.push(row);
            columnRowCount += 1;
        }

        if (columnEntries.length && !columnRowCount) {
            warnings.push({
                level: 'warning',
                code: 'column_without_rows',
                message: `No usable grades to export for ${resolveColumnName(column.columnName, column.fixedDate || new Date())}.`,
                sourceType: column.sourceType
            });
        }

        if (missingStudents.length) {
            warnings.push({
                level: 'info',
                code: 'student_without_data',
                message: `No data for ${missingStudents.length} student${missingStudents.length === 1 ? '' : 's'} in ${resolveColumnName(column.columnName, column.fixedDate || new Date())}.`,
                students: missingStudents,
                sourceType: column.sourceType
            });
        }
    }

    for (const [columnName, count] of outsideRangeByColumn.entries()) {
        warnings.push({
            level: 'warning',
            code: 'date_outside_semester',
            message: `${count} row${count === 1 ? '' : 's'} for ${columnName} fall outside the selected semester dates.`,
            column: columnName,
            count
        });
    }

    return { rows, warnings, errors };
};

/** Objects in the workbook's column order. */
export const rowToValues = (row) => EXPORT_ROW_FIELDS.map((field) => row[field] ?? null);

const sanitizeFilePart = (value) =>
    String(value || '')
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, '_')
        .replace(/^_+|_+$/g, '');

/** {Subject}_{Class}_gradebook_import_{ColumnsExported}.xlsx */
export const buildFileName = ({ subjectValue, className, columnNames = [] }) => {
    const parts = [
        sanitizeFilePart(subjectValue) || 'Subject',
        sanitizeFilePart(className) || 'Class',
        'gradebook',
        'import',
        ...columnNames.map(sanitizeFilePart).filter(Boolean)
    ];
    return `${parts.join('_')}.xlsx`;
};
