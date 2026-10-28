import ExcelJS from 'exceljs';
import ExportProfile from '../models/ExportProfile.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Student from '../models/Student.js';
import Grade from '../models/Grade.js';
import { getGradebookConfig } from './gradebookConfigService.js';
import {
    QUICK_SHEET_NAME,
    QUICK_SCHOOL_HEADERS,
    buildExportRows,
    buildFileName,
    resolveColumnName,
    rowToValues
} from './quickSchoolsExport.js';

const COLUMN_FIELDS = ['sourceType', 'enabled', 'columnName', 'category', 'totalMarks', 'dateRule', 'fixedDate'];
const PROFILE_FIELDS = ['subjectValue', 'gradeLevel', 'semesterName', 'nameSource', 'skipEmpty', 'roundTo', 'semester'];

const httpError = (statusCode, message, code = null) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (code) error.code = code;
    return error;
};

export const normalizeColumn = (column = {}) => ({
    sourceType: String(column.sourceType || '').trim().toLowerCase(),
    enabled: column.enabled !== false,
    columnName: String(column.columnName || '').trim(),
    category: String(column.category || '').trim(),
    totalMarks: Number(column.totalMarks) || 0,
    dateRule: column.dateRule === 'latest' ? 'latest' : 'fixed',
    fixedDate: column.fixedDate ? new Date(column.fixedDate) : null
});

/** Shape a request body into a profile the model accepts. */
export const buildProfilePayload = (body = {}) => {
    const semesterNumber = Number(body.semester);
    return {
        name: String(body.name || '').trim(),
        class: body.classId || body.class || null,
        subject: body.subjectId || body.subject || null,
        academicYear: String(body.academicYear || '').trim(),
        semester: semesterNumber === 1 || semesterNumber === 2 ? semesterNumber : null,
        subjectValue: String(body.subjectValue || '').trim(),
        gradeLevel: String(body.gradeLevel || '').trim(),
        semesterName: String(body.semesterName || '').trim(),
        columns: (Array.isArray(body.columns) ? body.columns : []).map(normalizeColumn),
        nameSource: body.nameSource === 'fullName' ? 'fullName' : 'externalName',
        skipEmpty: body.skipEmpty !== false,
        roundTo: Number.isFinite(Number(body.roundTo)) ? Math.min(4, Math.max(0, Number(body.roundTo))) : 2
    };
};

export const validateProfilePayload = (payload) => {
    if (!payload.name) return 'Profile name is required.';
    if (!payload.class) return 'Class is required.';
    if (!payload.subject) return 'Subject is required.';
    if (!payload.academicYear) return 'Academic year is required.';
    if (!payload.subjectValue) return 'Subject name or code is required.';
    if (!payload.gradeLevel) return 'Grade level is required.';
    if (!payload.semesterName) return 'Semester name is required.';
    if (!payload.columns.length) return 'At least one column is required.';
    return null;
};

/**
 * One-off edits layered on top of a saved profile, so a teacher can change a
 * value for a single export without rewriting the profile.
 */
export const applyOverrides = (profile, overrides = {}) => {
    if (!overrides || typeof overrides !== 'object') return profile;
    const merged = {
        ...profile,
        columns: (profile.columns || []).map((column) => ({ ...column }))
    };

    for (const field of PROFILE_FIELDS) {
        if (overrides[field] !== undefined) merged[field] = overrides[field];
    }
    if (overrides.subjectValue !== undefined) merged.subjectValue = String(overrides.subjectValue || '').trim();
    if (overrides.gradeLevel !== undefined) merged.gradeLevel = String(overrides.gradeLevel || '').trim();
    if (overrides.semesterName !== undefined) merged.semesterName = String(overrides.semesterName || '').trim();

    if (Array.isArray(overrides.columns)) {
        for (const patch of overrides.columns) {
            const key = String(patch?.sourceType || '').trim().toLowerCase();
            if (!key) continue;
            const target = merged.columns.find((column) => String(column.sourceType).toLowerCase() === key);
            if (!target) continue;
            for (const field of COLUMN_FIELDS) {
                if (patch[field] !== undefined) target[field] = patch[field];
            }
            Object.assign(target, normalizeColumn(target));
        }
    }

    return merged;
};

export const loadProfileById = async (schoolId, profileId) => {
    const profile = await ExportProfile.findOne({ _id: profileId, school: schoolId }).lean();
    if (!profile) throw httpError(404, 'Export profile not found.', 'EXPORT_PROFILE_NOT_FOUND');
    return profile;
};

const resolveSemesterRange = (config, semester) => {
    const number = Number(semester);
    if (!number || !Array.isArray(config?.semesters)) return null;
    const found = config.semesters.find((item) => Number(item.number) === number);
    if (!found?.startDate || !found?.endDate) return null;
    return { startDate: new Date(found.startDate), endDate: new Date(found.endDate) };
};

const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

/** Everything one preview or download needs, read from the database. */
export const loadExportContext = async ({ schoolId, profile, dateFrom = null, dateTo = null }) => {
    const classDoc = await Class.findOne({ _id: profile.class, school: schoolId })
        .select('name grade section academicYear')
        .lean();
    if (!classDoc) throw httpError(404, 'Class not found.', 'CLASS_NOT_FOUND');

    const subjectDoc = await Subject.findOne({ _id: profile.subject, school: schoolId })
        .select('name code')
        .lean();
    if (!subjectDoc) throw httpError(404, 'Subject not found.', 'SUBJECT_NOT_FOUND');

    const [students, entries, config] = await Promise.all([
        Student.find({
            $or: [{ currentClass: classDoc._id }, { enrolledClasses: classDoc._id }],
            status: 'active'
        })
            .select('firstName lastName externalName')
            .sort({ lastName: 1, firstName: 1 })
            .lean(),
        (() => {
            const query = {
                school: schoolId,
                class: classDoc._id,
                subject: subjectDoc._id,
                academicYear: profile.academicYear
            };
            if (profile.semester === 1 || profile.semester === 2) query.semester = profile.semester;
            const from = parseDate(dateFrom);
            const to = parseDate(dateTo);
            if (from || to) {
                query.date = {};
                if (from) query.date.$gte = from;
                if (to) {
                    const end = new Date(to);
                    end.setHours(23, 59, 59, 999);
                    query.date.$lte = end;
                }
            }
            return Grade.find(query)
                .select('student category gradeType title date marks maxMarks')
                .lean();
        })(),
        getGradebookConfig(schoolId, profile.academicYear)
    ]);

    return {
        classDoc,
        subjectDoc,
        students,
        entries,
        semesterRange: resolveSemesterRange(config, profile.semester)
    };
};

export const buildPreview = async ({ schoolId, profileId = null, profile: inlineProfile = null, overrides = {}, dateFrom = null, dateTo = null }) => {
    const saved = inlineProfile || await loadProfileById(schoolId, profileId);
    const profile = applyOverrides(saved, overrides);
    const context = await loadExportContext({ schoolId, profile, dateFrom, dateTo });

    const { rows, warnings, errors } = buildExportRows({
        profile,
        students: context.students,
        entries: context.entries,
        semesterRange: context.semesterRange
    });

    const enabledColumns = (profile.columns || []).filter((column) => column.enabled !== false);

    return {
        profile: {
            ...profile,
            subjectName: context.subjectDoc.name,
            subjectCode: context.subjectDoc.code,
            className: context.classDoc.name
        },
        rows,
        warnings,
        errors,
        meta: {
            studentCount: context.students.length,
            entryCount: context.entries.length,
            columnCount: enabledColumns.length,
            rowCount: rows.length
        }
    };
};

export const writeWorkbook = async (rows, profile) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(QUICK_SHEET_NAME);

    sheet.addRow(QUICK_SCHOOL_HEADERS);
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
        sheet.addRow(rowToValues(row));
    }

    for (let index = 1; index <= QUICK_SCHOOL_HEADERS.length; index += 1) {
        sheet.getColumn(index).width = 24;
    }

    // Column D must be a real date cell, not text — the importer reads the serial.
    for (let index = 2; index <= sheet.rowCount; index += 1) {
        sheet.getRow(index).getCell(4).numFmt = 'mm-dd-yy';
    }

    const enabledColumns = (profile.columns || []).filter((column) => column.enabled !== false);
    const columnNames = enabledColumns
        .map((column) => resolveColumnName(column.columnName, column.fixedDate || new Date()))
        .filter(Boolean);

    return {
        buffer: await workbook.xlsx.writeBuffer(),
        fileName: buildFileName({
            subjectValue: profile.subjectValue,
            className: profile.className,
            columnNames
        })
    };
};

export const buildExportFile = async (params) => {
    const preview = await buildPreview(params);
    if (preview.errors.length) {
        const error = httpError(400, 'Fix the highlighted problems before downloading.', 'EXPORT_VALIDATION_FAILED');
        error.details = preview.errors;
        throw error;
    }
    const { buffer, fileName } = await writeWorkbook(preview.rows, preview.profile);
    return { buffer, fileName, warnings: preview.warnings, rowCount: preview.rows.length };
};
