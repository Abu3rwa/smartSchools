import mongoose from 'mongoose';
import Class from '../../../models/Class.js';
import Subject from '../../../models/Subject.js';
import Teacher from '../../../models/Teacher.js';
import TimetablePeriod from '../../../models/TimetablePeriod.js';
import User from '../../../models/User.js';
import SchoolCalendarConfig from '../../../models/SchoolCalendarConfig.js';
import { runImportPipeline } from '../../import/importPipeline.js';
import { normalizeWeekWorkingDays, DEFAULT_WEEK_WORKING_DAYS } from '../../../utils/schoolWeekWorkingDays.js';
import { extractScheduleDraft, parseWeekday, to24Hour } from './scheduleExtraction.js';
import { matchScheduleDraft } from './scheduleMatching.js';
import {
    MAX_COMMIT_ROWS,
    MAX_SUBJECT_CODE_CHARS,
    MAX_SUBJECT_NAME_CHARS,
    MAX_SUBJECTS_TO_CREATE,
    PROMPT_VERSION,
    WEEKDAY_NAMES
} from './scheduleImportConstants.js';
import { scheduleImportError } from './scheduleImportErrors.js';

const AI_FEATURE = 'timetable_schedule_import';

const loadWorkingDays = async (schoolId) => {
    const config = await SchoolCalendarConfig.findOne({ school: schoolId, isActive: true })
        .select('weekWorkingDays')
        .lean();
    return normalizeWeekWorkingDays(config?.weekWorkingDays, DEFAULT_WEEK_WORKING_DAYS);
};

const weekdayNamesFor = (workingDays) => (
    workingDays
        .map((day) => WEEKDAY_NAMES[day])
        .filter(Boolean)
);

const resolveEligibleTeacher = async ({ teacherId, schoolId }) => {
    if (!teacherId) {
        throw scheduleImportError('Pick a teacher before importing a schedule.', 'TEACHER_REQUIRED');
    }
    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
        throw scheduleImportError('That teacher was not found in this school.', 'TEACHER_NOT_ELIGIBLE', 422);
    }
    const user = await User.findOne({ _id: teacherId, school: schoolId })
        .select('_id firstName lastName email role roles')
        .lean();
    if (!user) {
        throw scheduleImportError('That teacher was not found in this school.', 'TEACHER_NOT_ELIGIBLE', 422);
    }
    const roles = [user.role, ...(Array.isArray(user.roles) ? user.roles : [])].filter(Boolean);
    if (!roles.includes('teacher')) {
        throw scheduleImportError('That account is not a teacher.', 'TEACHER_NOT_ELIGIBLE', 422);
    }
    const profile = await Teacher.findOne({ user: user._id }).select('_id').lean();
    if (!profile) {
        throw scheduleImportError('That teacher has no teacher profile yet.', 'TEACHER_PROFILE_MISSING', 422);
    }
    return user;
};

const loadAnalyzeContext = async ({ schoolId, academicYear }) => {
    const [periods, classes, subjects, workingDays] = await Promise.all([
        TimetablePeriod.find({ isActive: true })
            .select('name startTime endTime order')
            .sort({ order: 1, startTime: 1 })
            .lean(),
        Class.find({ academicYear })
            .select('name grade section isActive')
            .sort({ grade: 1, section: 1 })
            .lean(),
        Subject.find({})
            .select('name code isActive')
            .sort({ name: 1 })
            .limit(1000)
            .lean(),
        loadWorkingDays(schoolId)
    ]);

    return {
        periods,
        classes: classes.filter((classDoc) => classDoc.isActive !== false),
        subjects,
        workingDays
    };
};

export const analyzeSchedulePdf = async ({ buffer, mimeType, teacherId, schoolId, academicYear }) => {
    const teacher = await resolveEligibleTeacher({ teacherId, schoolId });
    const context = await loadAnalyzeContext({ schoolId, academicYear });

    const staffNames = await Teacher.find({ isActive: true })
        .select('user')
        .populate('user', 'firstName lastName')
        .limit(600)
        .lean();
    const names = staffNames
        .map((profile) => `${profile.user?.firstName || ''} ${profile.user?.lastName || ''}`)
        .concat([`${teacher.firstName || ''} ${teacher.lastName || ''}`]);

    const extracted = await extractScheduleDraft({
        buffer,
        mimeType,
        staffNames: names,
        context: {
            weekdays: weekdayNamesFor(context.workingDays),
            periods: context.periods,
            classes: context.classes,
            subjects: context.subjects
        },
        usage: { feature: AI_FEATURE, refs: { sourceTypeHint: 'schedule_pdf' } }
    });

    const draft = matchScheduleDraft({
        draft: extracted,
        periods: context.periods,
        classes: context.classes,
        subjects: context.subjects
    });

    return {
        teacher: {
            id: String(teacher._id),
            name: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()
        },
        academicYear,
        promptVersion: PROMPT_VERSION,
        sourceType: extracted.sourceType,
        textTruncated: extracted.textTruncated,
        documentPeriods: extracted.periods,
        cells: draft.cells,
        summary: draft.summary,
        subjectProposals: draft.subjectProposals,
        school: {
            workingDays: weekdayNamesFor(context.workingDays),
            periods: context.periods.map((period) => ({
                id: String(period._id),
                name: period.name,
                startTime: period.startTime,
                endTime: period.endTime
            })),
            classes: context.classes.map((classDoc) => ({
                id: String(classDoc._id),
                name: classDoc.name,
                grade: classDoc.grade,
                section: classDoc.section
            })),
            subjects: context.subjects.map((subject) => ({
                id: String(subject._id),
                name: subject.name,
                code: subject.code,
                isActive: subject.isActive !== false
            }))
        }
    };
};

export const normalizeCommitRows = (rawRows) => {
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
        throw scheduleImportError('There are no reviewed rows to import.', 'SCHEDULE_ROWS_REQUIRED');
    }
    if (rawRows.length > MAX_COMMIT_ROWS) {
        throw scheduleImportError(
            `Too many rows (${rawRows.length}). The limit is ${MAX_COMMIT_ROWS}.`,
            'SCHEDULE_ROWS_TOO_MANY'
        );
    }

    const seen = new Set();
    const rows = [];
    rawRows.forEach((row, index) => {
        const dayOfWeek = parseWeekday(row?.day);
        const startTime = to24Hour(row?.startTime);
        const endTime = to24Hour(row?.endTime);
        const sessionType = String(row?.sessionType || 'class').toLowerCase();
        if (dayOfWeek === null || !startTime || !endTime || startTime >= endTime) {
            throw scheduleImportError(`Row ${index + 1} has an invalid day or time.`, 'SCHEDULE_ROW_INVALID');
        }
        if (!['class', 'admin'].includes(sessionType)) {
            throw scheduleImportError(`Row ${index + 1} has an invalid session type.`, 'SCHEDULE_ROW_INVALID');
        }
        const base = {
            teacherFirstName: '',
            teacherLastName: '',
            teacherEmail: '',
            day: WEEKDAY_NAMES[dayOfWeek],
            startTime,
            endTime,
            sessionType,
            room: String(row?.room || '').trim().slice(0, 50)
        };

        if (sessionType === 'admin') {
            const key = `${base.day}|${startTime}|${endTime}|admin`;
            if (!seen.has(key)) {
                seen.add(key);
                rows.push({ ...base, courseName: '', grade: null, section: '' });
            }
            return;
        }

        const grade = Number.parseInt(String(row?.grade ?? ''), 10);
        const section = String(row?.section || '').trim().toUpperCase().match(/[A-Z]$/)?.[0] || '';
        const courseName = String(row?.courseName || '').trim().slice(0, 160);
        if (!Number.isInteger(grade) || grade < 1 || grade > 12 || !section || !courseName) {
            throw scheduleImportError(
                `Row ${index + 1} is missing its class or subject.`,
                'SCHEDULE_ROW_INCOMPLETE'
            );
        }
        const key = `${base.day}|${startTime}|${endTime}|${grade}|${section}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({ ...base, courseName, grade, section });
    });

    if (rows.length === 0) {
        throw scheduleImportError('There are no reviewed rows to import.', 'SCHEDULE_ROWS_REQUIRED');
    }
    return rows;
};

export const normalizeSubjectsToCreate = (rawSubjects) => {
    if (!Array.isArray(rawSubjects) || rawSubjects.length === 0) return [];
    if (rawSubjects.length > MAX_SUBJECTS_TO_CREATE) {
        throw scheduleImportError(
            `Too many new subjects (${rawSubjects.length}). The limit is ${MAX_SUBJECTS_TO_CREATE}.`,
            'SCHEDULE_SUBJECTS_TOO_MANY'
        );
    }
    const byCode = new Map();
    for (const subject of rawSubjects) {
        const name = String(subject?.name || '').trim().slice(0, MAX_SUBJECT_NAME_CHARS);
        const code = String(subject?.code || '').replace(/[^A-Za-z0-9 ]+/g, ' ').trim().toUpperCase()
            .slice(0, MAX_SUBJECT_CODE_CHARS);
        if (!name || !code) {
            throw scheduleImportError(
                'Every new subject needs a name and a code.',
                'SCHEDULE_SUBJECT_INVALID'
            );
        }
        if (!byCode.has(code)) byCode.set(code, { name, code });
    }
    return [...byCode.values()];
};

export const commitScheduleImport = async ({ payload, school, schoolId, academicYear, userId }) => {
    const teacher = await resolveEligibleTeacher({ teacherId: payload?.teacherId, schoolId });
    const rows = normalizeCommitRows(payload?.rows);
    const subjectRows = normalizeSubjectsToCreate(payload?.subjectsToCreate);
    const context = { schoolId, school, userId, academicYear };

    let subjects = null;
    if (subjectRows.length > 0) {
        const existing = await Subject.find({ code: { $in: subjectRows.map((subject) => subject.code) } })
            .select('code')
            .lean();
        const existingCodes = new Set(existing.map((subject) => String(subject.code).toUpperCase()));
        const toCreate = subjectRows.filter((subject) => !existingCodes.has(subject.code));

        let run = null;
        if (toCreate.length > 0) {
            run = await runImportPipeline({
                entityType: 'subjects',
                mode: 'commit',
                payload: { rows: toCreate, duplicatePolicy: 'skip' },
                context
            });
            const created = await Subject.find({ code: { $in: toCreate.map((subject) => subject.code) } })
                .select('_id name code')
                .lean();
            subjects = {
                created: created.map((subject) => ({ id: String(subject._id), name: subject.name, code: subject.code })),
                skippedExisting: subjectRows.length - toCreate.length,
                failedRows: run?.summary?.failedRows ?? 0,
                importRunId: run?.importRunId || null,
                errors: run?.errors || []
            };
        } else {
            subjects = {
                created: [],
                skippedExisting: subjectRows.length,
                failedRows: 0,
                importRunId: null,
                errors: []
            };
        }
    }

    const teacherIdentity = {
        teacherFirstName: teacher.firstName || '',
        teacherLastName: teacher.lastName || '',
        teacherEmail: teacher.email
    };
    const assignmentRows = rows.map((row) => ({ ...row, ...teacherIdentity }));
    const assignments = await runImportPipeline({
        entityType: 'teacher_timetable_assignments',
        mode: 'commit',
        payload: {
            rows: assignmentRows,
            duplicatePolicy: payload?.duplicatePolicy === 'skip' ? 'skip' : 'update',
            fileName: String(payload?.fileName || 'schedule-import.pdf').slice(0, 120),
            metadata: { promptVersion: PROMPT_VERSION, sourceType: 'schedule_pdf' }
        },
        context
    });

    return {
        teacher: {
            id: String(teacher._id),
            name: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()
        },
        academicYear,
        subjects,
        assignments: {
            imported: assignments?.summary?.importedRows ?? 0,
            failed: assignments?.summary?.failedRows ?? 0,
            skipped: assignments?.summary?.skippedRows ?? 0,
            total: assignments?.summary?.totalRows ?? 0,
            importRunId: assignments?.importRunId || null,
            errorReportUrl: assignments?.errorReportUrl || null,
            errors: assignments?.errors || []
        }
    };
};
