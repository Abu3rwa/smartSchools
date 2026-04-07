import crypto from 'crypto';
import mongoose from 'mongoose';
import Student from '../../models/Student.js';
import Standard from '../../models/Standard.js';
import Subject from '../../models/Subject.js';
import Teacher from '../../models/Teacher.js';
import User from '../../models/User.js';
import Class from '../../models/Class.js';
import Room from '../../models/Room.js';
import Department from '../../models/Department.js';
import TimetablePeriod from '../../models/TimetablePeriod.js';
import ImportRun from '../../models/ImportRun.js';
import { resolveSchoolAcademicYear } from '../../utils/academicYear.js';
import { resolveSchoolFeatureContext } from '../../middleware/featureGate.js';
import {
    MAX_IMPORT_ROWS,
    ENTITY_TYPES,
    normalizeEntityType,
    normalizeImportOptions,
    normalizeRowByEntity,
    extractImportRows,
    createIssue,
    getEntityDisplayName
} from './importSchemas.js';
import { buildErrorReportPath, buildImportErrorReportCsv } from './importErrorReport.js';

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;
const ROOM_TYPES = new Set([
    'classroom', 'lab', 'lecture_hall', 'conference_room', 'library', 'gym', 'auditorium', 'office', 'other'
]);
const ROOM_STATUSES = new Set(['active', 'maintenance', 'renovation', 'closed']);
const SUBJECT_TYPES = new Set(['core', 'elective', 'extra']);

const toId = (value) => (value ? value.toString() : '');
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const hashImportInput = ({ entityType, rows, options, metadata }) => {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify({ entityType, rows, options, metadata }));
    return hash.digest('hex');
};

const parseTimeToMinutes = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
};

const intervalsOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

const makeMessage = (entityType, summary, { preview = false } = {}) => {
    const label = getEntityDisplayName(entityType);
    if (preview) {
        return `Preview generated for ${summary.totalRows} ${label} rows`;
    }

    if (
        summary.totalRows > 0
        && summary.importedRows === 0
        && summary.failedRows === 0
        && summary.skippedRows === summary.totalRows
    ) {
        return `No ${label} rows were imported. All ${summary.totalRows} rows were skipped.`;
    }

    return `${summary.importedRows} of ${summary.totalRows} ${label} imported successfully`;
};

const buildSummary = ({ candidates, createdRows, updatedRows, skippedRows }) => {
    const totalRows = candidates.length;
    const failedRows = candidates.filter((candidate) => candidate.errors.length > 0).length;
    const validRows = totalRows - failedRows;
    return {
        totalRows,
        validRows,
        importedRows: createdRows + updatedRows,
        failedRows,
        skippedRows,
        createdRows,
        updatedRows
    };
};

const buildSample = (candidates, limit) => (
    candidates
        .filter((candidate) => candidate.errors.length === 0)
        .slice(0, limit)
        .map((candidate) => candidate.normalized)
);

const flattenIssues = (candidates, key) => {
    const out = [];
    for (const candidate of candidates) {
        for (const issue of candidate[key]) out.push(issue);
    }
    return out;
};

const resolveEntityCapacity = async ({ entityType, schoolId }) => {
    if (!['students', 'teachers'].includes(entityType)) {
        return null;
    }

    const featureContext = await resolveSchoolFeatureContext(schoolId);
    const config = entityType === 'students'
        ? {
            limitKey: 'maxStudents',
            countQuery: { school: schoolId, status: 'active' },
            limitCode: 'STUDENT_LIMIT_REACHED',
            label: 'students'
        }
        : {
            limitKey: 'maxTeachers',
            countQuery: { school: schoolId, isActive: true },
            limitCode: 'TEACHER_LIMIT_REACHED',
            label: 'teachers'
        };

    const rawLimit = featureContext?.limits?.[config.limitKey];
    const maxAllowed = Number(rawLimit);
    const currentCount = entityType === 'students'
        ? await Student.countDocuments(config.countQuery)
        : await Teacher.countDocuments(config.countQuery);

    if (!Number.isFinite(maxAllowed) || maxAllowed < 0) {
        return {
            entityType,
            isLimited: false,
            maxAllowed: null,
            currentCount,
            remainingSeats: null
        };
    }

    return {
        entityType,
        isLimited: true,
        maxAllowed,
        currentCount,
        remainingSeats: Math.max(0, maxAllowed - currentCount),
        limitCode: config.limitCode,
        label: config.label,
        limitKey: config.limitKey
    };
};

const mapCapacityForResponse = (capacity) => {
    if (!capacity) return null;

    if (capacity.entityType === 'students') {
        return {
            isLimited: capacity.isLimited,
            maxStudents: capacity.maxAllowed,
            currentStudents: capacity.currentCount,
            remainingSeats: capacity.remainingSeats
        };
    }

    return {
        isLimited: capacity.isLimited,
        maxTeachers: capacity.maxAllowed,
        currentTeachers: capacity.currentCount,
        remainingSeats: capacity.remainingSeats
    };
};

const enforceEntityCapacityLimit = ({ candidates, capacity }) => {
    if (!capacity?.isLimited) return;

    let seatsLeft = capacity.remainingSeats;
    for (const candidate of candidates) {
        if (candidate.errors.length > 0) continue;
        if (candidate.action !== 'create') continue;

        if (seatsLeft > 0) {
            seatsLeft -= 1;
            continue;
        }

        candidate.action = 'error';
        candidate.errors.push(createIssue(
            candidate.rowNumber,
            'row',
            capacity.limitCode,
            `${capacity.label.slice(0, 1).toUpperCase() + capacity.label.slice(1)} limit reached for this plan (${capacity.maxAllowed} active ${capacity.label}). Upgrade the plan to import more ${capacity.label}.`,
            candidate.sourceRow
        ));
    }
};

const nextStudentId = (counterRef) => {
    const year = new Date().getFullYear().toString().slice(-2);
    counterRef.value += 1;
    return `STU${year}${String(counterRef.value).padStart(4, '0')}`;
};

const nextTeacherEmployeeId = (counterRef) => {
    const year = new Date().getFullYear().toString().slice(-2);
    counterRef.value += 1;
    return `TCH${year}${String(counterRef.value).padStart(4, '0')}`;
};

const resolveSubjectByRef = (ref, lookup) => {
    if (!ref) return null;
    const raw = String(ref).trim();
    if (!raw) return null;
    if (isObjectId(raw) && lookup.byId.has(raw)) return lookup.byId.get(raw);
    const upper = raw.toUpperCase();
    if (lookup.byCode.has(upper)) return lookup.byCode.get(upper);
    return lookup.byName.get(raw.toLowerCase()) || null;
};

const resolveDepartmentByRef = (ref, lookup) => {
    if (!ref) return null;
    const raw = String(ref).trim();
    if (!raw) return null;
    if (isObjectId(raw) && lookup.byId.has(raw)) return lookup.byId.get(raw);
    return lookup.byName.get(raw.toLowerCase()) || null;
};

const getImportMetadata = (entityType, payload = {}) => {
    const metadata = {
        duplicatePolicy: payload.duplicatePolicy,
        strictMode: payload.strictMode ?? payload.strict ?? false
    };
    if (entityType === 'students') {
        const classId = payload.classId || payload.currentClass;
        if (classId) metadata.classId = classId;
    }
    return metadata;
};

const mapIdempotentRunToResult = (run, entityType) => ({
    success: run.status === 'completed',
    statusCode: 200,
    message: `Reused recent import run for identical payload (${run._id})`,
    entityType,
    summary: {
        totalRows: run.totalRows,
        validRows: run.validRows,
        importedRows: run.importedRows,
        failedRows: run.failedRows,
        skippedRows: run.skippedRows,
        createdRows: run.metadata?.createdRows || run.importedRows,
        updatedRows: run.metadata?.updatedRows || 0
    },
    errors: run.errors || [],
    warnings: run.warnings || [],
    sample: [],
    importRunId: run._id,
    errorReportUrl: run.errorReportUrl || null,
    strictMode: run.metadata?.strictMode === true,
    duplicatePolicy: run.metadata?.duplicatePolicy || 'skip',
    idempotent: true
});

const buildSubjectLookup = async () => {
    const subjects = await Subject.find().select('_id code name').lean();
    const byId = new Map();
    const byCode = new Map();
    const byName = new Map();
    for (const item of subjects) {
        byId.set(toId(item._id), item);
        byCode.set(String(item.code || '').toUpperCase(), item);
        byName.set(String(item.name || '').toLowerCase(), item);
    }
    return { byId, byCode, byName };
};

const buildDepartmentLookup = async () => {
    const departments = await Department.find().select('_id name').lean();
    const byId = new Map();
    const byName = new Map();
    for (const item of departments) {
        byId.set(toId(item._id), item);
        byName.set(String(item.name || '').toLowerCase(), item);
    }
    return { byId, byName };
};

const buildTeacherLookup = async () => {
    const teachers = await Teacher.find()
        .select('_id employeeId user')
        .populate('user', 'email')
        .lean();
    const byId = new Map();
    const byEmployeeId = new Map();
    const byEmail = new Map();
    for (const item of teachers) {
        byId.set(toId(item._id), item);
        if (item.employeeId) byEmployeeId.set(String(item.employeeId).toLowerCase(), item);
        const email = String(item.user?.email || '').toLowerCase();
        if (email) byEmail.set(email, item);
    }
    return { byId, byEmployeeId, byEmail };
};

const buildPreparation = async ({ entityType, normalizedRows, context, payload }) => {
    const prep = {};

    if (entityType === 'students') {
        const classRefs = new Set();
        if (payload.classId && isObjectId(payload.classId)) classRefs.add(String(payload.classId));
        for (const row of normalizedRows) {
            if (row.normalized.classRef && isObjectId(row.normalized.classRef)) classRefs.add(row.normalized.classRef);
        }
        const classes = classRefs.size
            ? await Class.find({ _id: { $in: [...classRefs] } }).select('_id department academicYear').lean()
            : [];
        prep.classById = new Map(classes.map((item) => [toId(item._id), item]));
        prep.defaultClass = payload.classId ? prep.classById.get(String(payload.classId)) || null : null;
        if (payload.classId && !prep.defaultClass) {
            throw Object.assign(new Error('Selected class not found'), { statusCode: 400 });
        }

        const studentIds = normalizedRows.map((row) => row.normalized.studentId).filter(Boolean);
        const emails = normalizedRows.map((row) => row.normalized.email).filter(Boolean);
        const or = [];
        if (studentIds.length) or.push({ studentId: { $in: studentIds } });
        if (emails.length) or.push({ email: { $in: emails } });
        const existing = or.length ? await Student.find({ $or: or }).select('_id studentId email status').lean() : [];
        prep.studentById = new Map();
        prep.studentByEmail = new Map();
        for (const item of existing) {
            if (item.studentId) prep.studentById.set(String(item.studentId).toLowerCase(), item);
            if (item.email) prep.studentByEmail.set(String(item.email).toLowerCase(), item);
        }
        prep.studentCounter = { value: await Student.countDocuments() };
        prep.defaultAcademicYear = context.academicYear;
        return prep;
    }

    if (entityType === 'standards') {
        prep.subjectLookup = await buildSubjectLookup();
        const codes = normalizedRows.map((row) => row.normalized.code).filter(Boolean);
        const existing = codes.length ? await Standard.find({ code: { $in: codes } }).select('_id code').lean() : [];
        prep.standardByCode = new Map(existing.map((item) => [String(item.code).toUpperCase(), item]));
        return prep;
    }

    if (entityType === 'subjects') {
        const codes = normalizedRows.map((row) => row.normalized.code).filter(Boolean);
        const existing = codes.length ? await Subject.find({ code: { $in: codes } }).select('_id code').lean() : [];
        prep.subjectByCode = new Map(existing.map((item) => [String(item.code).toUpperCase(), item]));
        return prep;
    }

    if (entityType === 'teachers') {
        const emails = normalizedRows.map((row) => row.normalized.email).filter(Boolean);
        const users = emails.length
            ? await User.find({ email: { $in: emails } })
                .select('_id email role school')
                .setOptions({ skipTenantFilter: true })
                .lean()
            : [];
        prep.userByEmail = new Map(users.map((item) => [String(item.email).toLowerCase(), item]));

        const userIds = users.map((item) => item._id);
        const employeeIds = normalizedRows.map((row) => row.normalized.employeeId).filter(Boolean);
        const teacherOr = [];
        if (userIds.length) teacherOr.push({ user: { $in: userIds } });
        if (employeeIds.length) teacherOr.push({ employeeId: { $in: employeeIds } });
        const teachers = teacherOr.length ? await Teacher.find({ $or: teacherOr }).select('_id user employeeId').lean() : [];
        prep.teacherByUserId = new Map();
        prep.teacherByEmployeeId = new Map();
        for (const item of teachers) {
            prep.teacherByUserId.set(toId(item.user), item);
            if (item.employeeId) prep.teacherByEmployeeId.set(String(item.employeeId).toLowerCase(), item);
        }

        prep.departmentLookup = await buildDepartmentLookup();
        prep.subjectLookup = await buildSubjectLookup();
        const year = new Date().getFullYear().toString().slice(-2);
        const prefix = `TCH${year}`;
        const existingIds = await Teacher.find({ employeeId: new RegExp(`^${prefix}`) }).select('employeeId').lean();
        const maxSeq = existingIds.length
            ? Math.max(...existingIds.map((item) => Number.parseInt(String(item.employeeId).slice(-4), 10) || 0))
            : 0;
        prep.teacherEmployeeCounter = { value: maxSeq };
        return prep;
    }

    if (entityType === 'classes') {
        const keys = normalizedRows
            .filter((row) => row.normalized.grade !== null && row.normalized.academicYear)
            .map((row) => ({
                grade: row.normalized.grade,
                section: row.normalized.section || '',
                academicYear: row.normalized.academicYear
            }));
        const grades = [...new Set(keys.map((k) => k.grade))];
        const years = [...new Set(keys.map((k) => k.academicYear))];
        const existing = grades.length && years.length
            ? await Class.find({ grade: { $in: grades }, academicYear: { $in: years } })
                .select('_id grade section academicYear')
                .lean()
            : [];
        prep.classByKey = new Map(existing.map((item) => [
            `${item.grade}|${String(item.section || '').toUpperCase()}|${item.academicYear}`,
            item
        ]));
        prep.departmentLookup = await buildDepartmentLookup();
        prep.teacherLookup = await buildTeacherLookup();
        return prep;
    }

    if (entityType === 'rooms') {
        const names = normalizedRows.map((row) => row.normalized.name).filter(Boolean);
        const existing = names.length ? await Room.find({ name: { $in: names } }).select('_id name').lean() : [];
        prep.roomByName = new Map(existing.map((item) => [String(item.name).toLowerCase(), item]));
        return prep;
    }

    if (entityType === 'timetable_periods') {
        const names = normalizedRows.map((row) => row.normalized.name).filter(Boolean);
        const [existingByName, activePeriods] = await Promise.all([
            names.length ? TimetablePeriod.find({ name: { $in: names } }).select('_id name').lean() : [],
            TimetablePeriod.find({ isActive: true }).select('_id name startTime endTime').lean()
        ]);
        prep.periodByName = new Map(existingByName.map((item) => [String(item.name).toLowerCase(), item]));
        prep.activePeriods = activePeriods;
        return prep;
    }

    return prep;
};

const validateFileLevelDuplicates = ({ candidates, options }) => {
    const signatures = new Map();
    for (const candidate of candidates) {
        if (candidate.errors.length > 0) continue;
        for (const signature of candidate.duplicateSignatures || []) {
            if (!signatures.has(signature)) {
                signatures.set(signature, candidate.rowNumber);
                continue;
            }
            const sourceRowNumber = signatures.get(signature);
            if (options.duplicatePolicy === 'skip') {
                candidate.action = 'skip';
                candidate.warnings.push(createIssue(
                    candidate.rowNumber,
                    'row',
                    'DUPLICATE_IN_FILE_SKIPPED',
                    `Duplicate of row ${sourceRowNumber} skipped due to duplicatePolicy=skip`,
                    candidate.sourceRow
                ));
            } else {
                candidate.action = 'error';
                candidate.errors.push(createIssue(
                    candidate.rowNumber,
                    'row',
                    'DUPLICATE_IN_FILE',
                    `Row duplicates row ${sourceRowNumber} in the same file`,
                    candidate.sourceRow
                ));
            }
            break;
        }
    }
};

const resolveExistingAndAction = ({ candidate, entityType, options, preparation }) => {
    let existing = null;

    if (entityType === 'students') {
        const byStudentId = candidate.normalized.studentId
            ? preparation.studentById.get(String(candidate.normalized.studentId).toLowerCase())
            : null;
        const byEmail = candidate.normalized.email
            ? preparation.studentByEmail.get(String(candidate.normalized.email).toLowerCase())
            : null;
        if (byStudentId && byEmail && toId(byStudentId._id) !== toId(byEmail._id)) {
            candidate.errors.push(createIssue(
                candidate.rowNumber,
                'row',
                'DUPLICATE_KEY_CONFLICT',
                'studentId and email match different existing students',
                candidate.sourceRow
            ));
            candidate.action = 'error';
            return;
        }
        existing = byStudentId || byEmail || null;
    }

    if (entityType === 'standards') {
        existing = preparation.standardByCode.get(String(candidate.normalized.code || '').toUpperCase()) || null;
    }

    if (entityType === 'subjects') {
        existing = preparation.subjectByCode.get(String(candidate.normalized.code || '').toUpperCase()) || null;
    }

    if (entityType === 'teachers') {
        const emailKey = String(candidate.normalized.email || '').toLowerCase();
        const employeeIdKey = candidate.normalized.employeeId
            ? String(candidate.normalized.employeeId).toLowerCase()
            : null;
        const user = preparation.userByEmail.get(emailKey) || null;
        const teacherByUser = user ? preparation.teacherByUserId.get(toId(user._id)) : null;
        const teacherByEmployee = employeeIdKey ? preparation.teacherByEmployeeId.get(employeeIdKey) : null;

        if (user) {
            if (user.role !== 'teacher') {
                candidate.errors.push(createIssue(
                    candidate.rowNumber,
                    'email',
                    'USER_ROLE_CONFLICT',
                    `Email "${emailKey}" belongs to a non-teacher account`,
                    candidate.sourceRow
                ));
            } else if (toId(user.school) !== toId(candidate.context.schoolId)) {
                candidate.errors.push(createIssue(
                    candidate.rowNumber,
                    'email',
                    'TENANT_CONFLICT',
                    `Email "${emailKey}" belongs to another school`,
                    candidate.sourceRow
                ));
            }
        }
        if (teacherByUser && teacherByEmployee && toId(teacherByUser._id) !== toId(teacherByEmployee._id)) {
            candidate.errors.push(createIssue(
                candidate.rowNumber,
                'employeeId',
                'DUPLICATE_KEY_CONFLICT',
                'email and employeeId reference different teachers',
                candidate.sourceRow
            ));
        }

        candidate.resolvedUser = user;
        existing = teacherByUser || teacherByEmployee || null;
    }

    if (entityType === 'classes') {
        const key = `${candidate.normalized.grade}|${candidate.normalized.section || ''}|${candidate.normalized.academicYear}`;
        existing = preparation.classByKey.get(key) || null;
    }

    if (entityType === 'rooms') {
        existing = preparation.roomByName.get(String(candidate.normalized.name || '').toLowerCase()) || null;
    }

    if (entityType === 'timetable_periods') {
        existing = preparation.periodByName.get(String(candidate.normalized.name || '').toLowerCase()) || null;
    }

    if (candidate.errors.length > 0) {
        candidate.action = 'error';
        return;
    }

    candidate.existing = existing;
    if (!existing) {
        candidate.action = 'create';
        return;
    }

    if (options.duplicatePolicy === 'skip') {
        candidate.action = 'skip';
        candidate.warnings.push(createIssue(
            candidate.rowNumber,
            'row',
            'DUPLICATE_SKIPPED',
            'Duplicate row was skipped due to duplicatePolicy=skip',
            candidate.sourceRow
        ));
        return;
    }

    if (options.duplicatePolicy === 'error') {
        candidate.action = 'error';
        candidate.errors.push(createIssue(
            candidate.rowNumber,
            'row',
            'DUPLICATE_EXISTS',
            'Duplicate row exists and duplicatePolicy=error',
            candidate.sourceRow
        ));
        return;
    }

    candidate.action = 'update';
};

const validatePeriodOverlaps = ({ candidates, preparation }) => {
    const intervals = (preparation.activePeriods || []).map((item) => ({
        id: toId(item._id),
        name: item.name,
        start: parseTimeToMinutes(item.startTime),
        end: parseTimeToMinutes(item.endTime)
    }));

    for (const candidate of candidates) {
        if (candidate.errors.length > 0) continue;
        if (!['create', 'update'].includes(candidate.action)) continue;
        if (candidate.normalized.isActive === false) continue;

        const currentStart = parseTimeToMinutes(candidate.normalized.startTime);
        const currentEnd = parseTimeToMinutes(candidate.normalized.endTime);
        const existingId = candidate.existing ? toId(candidate.existing._id) : null;

        const conflict = intervals.find((entry) => {
            if (existingId && entry.id === existingId) return false;
            return intervalsOverlap(currentStart, currentEnd, entry.start, entry.end);
        });
        if (conflict) {
            candidate.action = 'error';
            candidate.errors.push(createIssue(
                candidate.rowNumber,
                'startTime',
                'PERIOD_OVERLAP',
                `Period overlaps with existing period "${conflict.name}"`,
                candidate.sourceRow
            ));
            continue;
        }

        intervals.push({
            id: existingId || `new-${candidate.rowNumber}`,
            name: candidate.normalized.name,
            start: currentStart,
            end: currentEnd
        });
    }
};

const resolveStudentClass = (candidate, preparation, context) => {
    const ref = candidate.normalized.classRef || (context.payload?.classId ? String(context.payload.classId) : null);
    if (!ref) return { classDoc: preparation.defaultClass || null, errors: [] };
    if (!isObjectId(ref)) {
        return {
            classDoc: null,
            errors: [createIssue(candidate.rowNumber, 'classId', 'INVALID_REFERENCE', 'classId must be a valid object id', candidate.sourceRow)]
        };
    }
    const classDoc = preparation.classById.get(String(ref)) || null;
    if (!classDoc) {
        return {
            classDoc: null,
            errors: [createIssue(candidate.rowNumber, 'classId', 'NOT_FOUND', 'Referenced class was not found', candidate.sourceRow)]
        };
    }
    return { classDoc, errors: [] };
};

const resolveClassTeacherRef = (candidate, preparation) => {
    const ref = candidate.normalized.classTeacherRef;
    if (!ref) return { teacherId: null, errors: [] };
    const raw = String(ref).trim();
    if (!raw) return { teacherId: null, errors: [] };
    if (isObjectId(raw) && preparation.teacherLookup.byId.has(raw)) {
        return { teacherId: preparation.teacherLookup.byId.get(raw)._id, errors: [] };
    }
    if (raw.includes('@')) {
        const teacher = preparation.teacherLookup.byEmail.get(raw.toLowerCase());
        if (teacher) return { teacherId: teacher._id, errors: [] };
    } else {
        const teacher = preparation.teacherLookup.byEmployeeId.get(raw.toLowerCase());
        if (teacher) return { teacherId: teacher._id, errors: [] };
    }
    return {
        teacherId: null,
        errors: [createIssue(candidate.rowNumber, 'classTeacher', 'NOT_FOUND', 'classTeacher reference could not be resolved', candidate.sourceRow)]
    };
};

const persistCandidate = async ({ candidate, entityType, preparation, context }) => {
    const base = { created: false, updated: false, skipped: false };
    if (candidate.action === 'skip') return { ...base, skipped: true };
    if (candidate.action === 'error') return base;

    if (entityType === 'students') {
        const { classDoc, errors } = resolveStudentClass(candidate, preparation, context);
        if (errors.length > 0) {
            candidate.errors.push(...errors);
            candidate.action = 'error';
            return base;
        }
        const academicYear = candidate.normalized.academicYear || classDoc?.academicYear || preparation.defaultAcademicYear || context.academicYear;
        if (!academicYear) {
            candidate.errors.push(createIssue(
                candidate.rowNumber,
                'academicYear',
                'REQUIRED_FIELD',
                'academicYear could not be resolved',
                candidate.sourceRow
            ));
            candidate.action = 'error';
            return base;
        }

        const payload = {
            firstName: candidate.normalized.firstName,
            lastName: candidate.normalized.lastName,
            dateOfBirth: candidate.normalized.dateOfBirth,
            gender: candidate.normalized.gender,
            academicYear,
            status: 'active'
        };
        if (candidate.normalized.email) payload.email = candidate.normalized.email;
        if (classDoc?._id) payload.currentClass = classDoc._id;
        if (classDoc?.department) payload.department = classDoc.department;
        if (candidate.normalized.parentInfo) payload.parentInfo = candidate.normalized.parentInfo;

        if (candidate.action === 'create') {
            payload.school = context.schoolId;
            payload.studentId = candidate.normalized.studentId || nextStudentId(preparation.studentCounter);
            const created = await Student.create(payload);
            return { ...base, created: true, documentId: created._id };
        }

        const updates = { ...payload };
        if (candidate.normalized.studentId) updates.studentId = candidate.normalized.studentId;
        if (classDoc?._id) updates.$addToSet = { enrolledClasses: classDoc._id };
        await Student.findByIdAndUpdate(candidate.existing._id, updates, { runValidators: true });
        return { ...base, updated: true, documentId: candidate.existing._id };
    }

    if (entityType === 'standards') {
        const subject = resolveSubjectByRef(candidate.normalized.subjectRef, preparation.subjectLookup);
        if (!subject) {
            candidate.errors.push(createIssue(
                candidate.rowNumber,
                'subject',
                'NOT_FOUND',
                'subject reference could not be resolved',
                candidate.sourceRow
            ));
            candidate.action = 'error';
            return base;
        }
        const payload = {
            code: candidate.normalized.code,
            name: candidate.normalized.name,
            description: candidate.normalized.description,
            subject: subject._id,
            gradeLevel: candidate.normalized.gradeLevel,
            category: candidate.normalized.category || '',
            masteryThreshold: candidate.normalized.masteryThreshold ?? 80,
            masteryMinQuestions: candidate.normalized.masteryMinQuestions ?? 5,
            isActive: candidate.normalized.isActive ?? true,
            createdBy: context.userId
        };
        if (candidate.action === 'create') {
            const created = await Standard.create({ ...payload, school: context.schoolId });
            return { ...base, created: true, documentId: created._id };
        }
        await Standard.findByIdAndUpdate(candidate.existing._id, payload, { runValidators: true });
        return { ...base, updated: true, documentId: candidate.existing._id };
    }

    if (entityType === 'subjects') {
        const type = SUBJECT_TYPES.has(candidate.normalized.type) ? candidate.normalized.type : 'core';
        const payload = {
            name: candidate.normalized.name,
            code: candidate.normalized.code,
            description: candidate.normalized.description || '',
            applicableGrades: candidate.normalized.applicableGrades || [],
            type,
            creditHours: candidate.normalized.creditHours ?? 1,
            maxMarks: candidate.normalized.maxMarks ?? 100,
            passingMarks: candidate.normalized.passingMarks ?? 40,
            dailyMaxMarks: candidate.normalized.dailyMaxMarks ?? 10,
            isActive: candidate.normalized.isActive ?? true
        };
        if (!SUBJECT_TYPES.has(candidate.normalized.type)) {
            candidate.warnings.push(createIssue(
                candidate.rowNumber,
                'type',
                'NORMALIZATION_FALLBACK',
                `Unsupported subject type "${candidate.normalized.type}" defaulted to "core"`,
                candidate.sourceRow
            ));
        }
        if (candidate.action === 'create') {
            const created = await Subject.create({ ...payload, school: context.schoolId });
            return { ...base, created: true, documentId: created._id };
        }
        await Subject.findByIdAndUpdate(candidate.existing._id, payload, { runValidators: true });
        return { ...base, updated: true, documentId: candidate.existing._id };
    }

    if (entityType === 'teachers') {
        const department = resolveDepartmentByRef(candidate.normalized.departmentRef, preparation.departmentLookup);
        if (candidate.normalized.departmentRef && !department) {
            candidate.errors.push(createIssue(
                candidate.rowNumber,
                'department',
                'NOT_FOUND',
                'department reference could not be resolved',
                candidate.sourceRow
            ));
            candidate.action = 'error';
            return base;
        }

        const subjectIds = [];
        for (const rawRef of candidate.normalized.subjectsRef || []) {
            const subject = resolveSubjectByRef(rawRef, preparation.subjectLookup);
            if (!subject) {
                candidate.errors.push(createIssue(
                    candidate.rowNumber,
                    'subjects',
                    'NOT_FOUND',
                    `subject reference "${rawRef}" could not be resolved`,
                    candidate.sourceRow
                ));
                candidate.action = 'error';
                return base;
            }
            subjectIds.push(subject._id);
        }

        let user = candidate.resolvedUser
            ? await User.findById(candidate.resolvedUser._id).setOptions({ skipTenantFilter: true })
            : null;
        if (!user) {
            user = await User.create({
                email: candidate.normalized.email,
                password: candidate.normalized.password || 'Teacher@123',
                firstName: candidate.normalized.firstName,
                lastName: candidate.normalized.lastName,
                phone: candidate.normalized.phone || undefined,
                role: 'teacher',
                school: context.schoolId,
                isActive: candidate.normalized.isActive ?? true
            });
        } else {
            user.firstName = candidate.normalized.firstName;
            user.lastName = candidate.normalized.lastName;
            if (candidate.normalized.phone !== undefined) user.phone = candidate.normalized.phone;
            user.isActive = candidate.normalized.isActive ?? user.isActive;
            await user.save();
        }

        let teacherDoc = candidate.existing
            ? await Teacher.findById(candidate.existing._id)
            : await Teacher.findOne({ user: user._id });

        const employeeId = candidate.normalized.employeeId || teacherDoc?.employeeId || nextTeacherEmployeeId(preparation.teacherEmployeeCounter);
        const conflict = await Teacher.findOne({
            employeeId,
            ...(teacherDoc ? { _id: { $ne: teacherDoc._id } } : {})
        }).lean();
        if (conflict) {
            candidate.errors.push(createIssue(
                candidate.rowNumber,
                'employeeId',
                'DUPLICATE_EXISTS',
                `employeeId "${employeeId}" is already in use`,
                candidate.sourceRow
            ));
            candidate.action = 'error';
            return base;
        }

        const payload = {
            school: context.schoolId,
            user: user._id,
            employeeId,
            department: department?._id || undefined,
            qualification: candidate.normalized.qualification || '',
            specialization: candidate.normalized.specialization || '',
            subjects: subjectIds,
            isActive: candidate.normalized.isActive ?? true
        };

        if (!teacherDoc) {
            teacherDoc = await Teacher.create(payload);
            return { ...base, created: true, documentId: teacherDoc._id };
        }
        await Teacher.findByIdAndUpdate(teacherDoc._id, payload, { runValidators: true });
        return { ...base, updated: true, documentId: teacherDoc._id };
    }

    if (entityType === 'classes') {
        const { teacherId, errors } = resolveClassTeacherRef(candidate, preparation);
        if (errors.length > 0) {
            candidate.errors.push(...errors);
            candidate.action = 'error';
            return base;
        }
        const department = resolveDepartmentByRef(candidate.normalized.departmentRef, preparation.departmentLookup);
        if (candidate.normalized.departmentRef && !department) {
            candidate.errors.push(createIssue(
                candidate.rowNumber,
                'department',
                'NOT_FOUND',
                'department reference could not be resolved',
                candidate.sourceRow
            ));
            candidate.action = 'error';
            return base;
        }

        const payload = {
            school: context.schoolId,
            grade: candidate.normalized.grade,
            section: candidate.normalized.section || '',
            academicYear: candidate.normalized.academicYear,
            room: candidate.normalized.room || '',
            capacity: candidate.normalized.capacity ?? 40,
            classTeacher: teacherId || undefined,
            department: department?._id || undefined,
            isActive: candidate.normalized.isActive ?? true,
            name: candidate.normalized.name || `Grade ${candidate.normalized.grade}${candidate.normalized.section ? `-${candidate.normalized.section}` : ''}`
        };

        if (candidate.action === 'create') {
            const created = await Class.create(payload);
            return { ...base, created: true, documentId: created._id };
        }
        await Class.findByIdAndUpdate(candidate.existing._id, payload, { runValidators: true });
        return { ...base, updated: true, documentId: candidate.existing._id };
    }

    if (entityType === 'rooms') {
        const type = ROOM_TYPES.has(candidate.normalized.type) ? candidate.normalized.type : 'classroom';
        const status = ROOM_STATUSES.has(candidate.normalized.status) ? candidate.normalized.status : 'active';
        if (!ROOM_TYPES.has(candidate.normalized.type)) {
            candidate.warnings.push(createIssue(
                candidate.rowNumber,
                'type',
                'NORMALIZATION_FALLBACK',
                `Unsupported room type "${candidate.normalized.type}" defaulted to "classroom"`,
                candidate.sourceRow
            ));
        }
        if (!ROOM_STATUSES.has(candidate.normalized.status)) {
            candidate.warnings.push(createIssue(
                candidate.rowNumber,
                'status',
                'NORMALIZATION_FALLBACK',
                `Unsupported room status "${candidate.normalized.status}" defaulted to "active"`,
                candidate.sourceRow
            ));
        }

        const payload = {
            name: candidate.normalized.name,
            type,
            capacity: candidate.normalized.capacity ?? 40,
            building: candidate.normalized.building || '',
            floor: candidate.normalized.floor || '',
            number: candidate.normalized.number || '',
            status,
            isAvailable: candidate.normalized.isAvailable ?? true,
            notes: candidate.normalized.notes || ''
        };

        if (candidate.action === 'create') {
            const created = await Room.create({
                ...payload,
                school: context.schoolId,
                createdBy: context.userId
            });
            return { ...base, created: true, documentId: created._id };
        }

        await Room.findByIdAndUpdate(candidate.existing._id, {
            ...payload,
            lastModifiedBy: context.userId
        }, { runValidators: true });
        return { ...base, updated: true, documentId: candidate.existing._id };
    }

    if (entityType === 'timetable_periods') {
        const payload = {
            name: candidate.normalized.name,
            startTime: candidate.normalized.startTime,
            endTime: candidate.normalized.endTime,
            order: candidate.normalized.order ?? 0,
            isActive: candidate.normalized.isActive ?? true
        };
        if (candidate.action === 'create') {
            const created = await TimetablePeriod.create({
                ...payload,
                school: context.schoolId,
                createdBy: context.userId
            });
            return { ...base, created: true, documentId: created._id };
        }
        await TimetablePeriod.findByIdAndUpdate(candidate.existing._id, {
            ...payload,
            lastModifiedBy: context.userId
        }, { runValidators: true });
        return { ...base, updated: true, documentId: candidate.existing._id };
    }

    return base;
};

const finalizeImportRun = async ({ importRun, summary, errors, warnings, startedAt, status, metadata, sourceRows }) => {
    const completedAt = new Date();
    const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
    const errorReportCsv = errors.length > 0 ? buildImportErrorReportCsv({ rows: sourceRows, errors }) : null;
    const errorReportUrl = errorReportCsv ? buildErrorReportPath(importRun._id) : null;

    importRun.status = status;
    importRun.totalRows = summary.totalRows;
    importRun.validRows = summary.validRows;
    importRun.importedRows = summary.importedRows;
    importRun.failedRows = summary.failedRows;
    importRun.skippedRows = summary.skippedRows;
    importRun.completedAt = completedAt;
    importRun.durationMs = durationMs;
    importRun.errorReportUrl = errorReportUrl;
    importRun.errors = errors;
    importRun.warnings = warnings;
    importRun.metadata = {
        ...importRun.metadata,
        ...metadata,
        createdRows: summary.createdRows,
        updatedRows: summary.updatedRows,
        errorReportCsv,
        sourceRows: errors.length > 0 ? sourceRows : []
    };
    await importRun.save();
    return { errorReportUrl };
};

export const runImportPipeline = async ({
    entityType,
    mode = 'commit',
    payload = {},
    context = {}
}) => {
    const normalizedEntityType = normalizeEntityType(entityType);
    if (!normalizedEntityType || !ENTITY_TYPES.includes(normalizedEntityType)) {
        throw Object.assign(new Error(`Unsupported entityType "${entityType}"`), { statusCode: 400 });
    }

    const rows = extractImportRows(normalizedEntityType, payload);
    if (!Array.isArray(rows) || rows.length === 0) {
        throw Object.assign(new Error('No import rows were provided'), { statusCode: 400 });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
        throw Object.assign(new Error(`Maximum ${MAX_IMPORT_ROWS} rows per import`), { statusCode: 400 });
    }

    const options = normalizeImportOptions(payload);
    const requestAcademicYear = context.academicYear || resolveSchoolAcademicYear(context.school);
    const metadata = getImportMetadata(normalizedEntityType, payload);
    const fileHash = hashImportInput({
        entityType: normalizedEntityType,
        rows,
        options,
        metadata
    });

    if (mode === 'commit') {
        const duplicateWindowStart = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
        const recentRun = await ImportRun.findOne({
            entityType: normalizedEntityType,
            fileHash,
            status: 'completed',
            failedRows: 0,
            importedRows: { $gt: 0 },
            createdAt: { $gte: duplicateWindowStart }
        }).sort({ createdAt: -1 });
        if (recentRun) return mapIdempotentRunToResult(recentRun, normalizedEntityType);
    }

    const candidates = rows.map((sourceRow, index) => {
        const rowNumber = index + 1;
        const parsed = normalizeRowByEntity(normalizedEntityType, sourceRow, {
            rowNumber,
            context: { academicYear: requestAcademicYear }
        });
        return {
            rowNumber,
            sourceRow,
            normalized: parsed.normalized,
            duplicateSignatures: parsed.duplicateSignatures || [],
            errors: [...(parsed.errors || [])],
            warnings: [...(parsed.warnings || [])],
            action: 'pending',
            existing: null,
            context: { ...context, payload }
        };
    });

    const preparation = await buildPreparation({
        entityType: normalizedEntityType,
        normalizedRows: candidates,
        context: { ...context, academicYear: requestAcademicYear },
        payload
    });

    const entityCapacity = await resolveEntityCapacity({
        entityType: normalizedEntityType,
        schoolId: context.schoolId
    });

    validateFileLevelDuplicates({ candidates, options });

    for (const candidate of candidates) {
        if (candidate.errors.length > 0) {
            candidate.action = 'error';
            continue;
        }
        resolveExistingAndAction({
            candidate,
            entityType: normalizedEntityType,
            options,
            preparation
        });
        if (candidate.action === 'pending') candidate.action = 'create';
    }

    if (entityCapacity) {
        enforceEntityCapacityLimit({ candidates, capacity: entityCapacity });
    }

    if (normalizedEntityType === 'timetable_periods') {
        validatePeriodOverlaps({ candidates, preparation });
    }

    if (mode === 'preview') {
        const summary = buildSummary({
            candidates,
            createdRows: candidates.filter((row) => row.action === 'create').length,
            updatedRows: candidates.filter((row) => row.action === 'update').length,
            skippedRows: candidates.filter((row) => row.action === 'skip').length
        });
        const errors = flattenIssues(candidates, 'errors');
        const warnings = flattenIssues(candidates, 'warnings');
        return {
            success: true,
            statusCode: 200,
            message: makeMessage(normalizedEntityType, summary, { preview: true }),
            entityType: normalizedEntityType,
            summary,
            errors,
            warnings,
            sample: buildSample(candidates, options.sampleLimit),
            importRunId: null,
            errorReportUrl: null,
            capacity: mapCapacityForResponse(entityCapacity),
            strictMode: options.strictMode,
            duplicatePolicy: options.duplicatePolicy,
            idempotent: false
        };
    }

    const startedAt = new Date();
    const importRun = await ImportRun.create({
        school: context.schoolId,
        entityType: normalizedEntityType,
        uploadedBy: context.userId,
        fileName: payload.fileName || `${normalizedEntityType}-import-${startedAt.toISOString()}.csv`,
        fileHash,
        status: 'validating',
        startedAt,
        metadata: {
            ...metadata,
            strictMode: options.strictMode,
            duplicatePolicy: options.duplicatePolicy
        }
    });

    if (options.strictMode && candidates.some((candidate) => candidate.errors.length > 0)) {
        const summary = buildSummary({
            candidates,
            createdRows: 0,
            updatedRows: 0,
            skippedRows: candidates.filter((row) => row.action === 'skip').length
        });
        const errors = flattenIssues(candidates, 'errors');
        const warnings = flattenIssues(candidates, 'warnings');
        const finalized = await finalizeImportRun({
            importRun,
            summary,
            errors,
            warnings,
            startedAt,
            status: 'failed',
            metadata: { strictModeAborted: true },
            sourceRows: rows
        });
        return {
            success: false,
            statusCode: 400,
            message: 'Strict mode enabled: import aborted because validation errors were found',
            entityType: normalizedEntityType,
            summary,
            errors,
            warnings,
            sample: buildSample(candidates, options.sampleLimit),
            importRunId: importRun._id,
            errorReportUrl: finalized.errorReportUrl,
            capacity: mapCapacityForResponse(entityCapacity),
            strictMode: options.strictMode,
            duplicatePolicy: options.duplicatePolicy,
            idempotent: false
        };
    }

    let createdRows = 0;
    let updatedRows = 0;
    let skippedRows = candidates.filter((candidate) => candidate.action === 'skip').length;

    for (const candidate of candidates) {
        if (candidate.action === 'error' || candidate.action === 'skip') continue;
        try {
            const persisted = await persistCandidate({
                candidate,
                entityType: normalizedEntityType,
                preparation,
                context: {
                    ...context,
                    academicYear: requestAcademicYear,
                    payload
                }
            });
            if (persisted.created) createdRows += 1;
            if (persisted.updated) updatedRows += 1;
            if (persisted.skipped) skippedRows += 1;
            if (candidate.errors.length > 0) candidate.action = 'error';
        } catch (error) {
            candidate.action = 'error';
            candidate.errors.push(createIssue(
                candidate.rowNumber,
                'row',
                error?.code === 11000 ? 'DUPLICATE_KEY' : 'PERSISTENCE_ERROR',
                error?.code === 11000
                    ? 'Duplicate key error while saving row'
                    : (error.message || 'Failed to persist row'),
                candidate.sourceRow
            ));
        }
    }

    const summary = buildSummary({ candidates, createdRows, updatedRows, skippedRows });
    const errors = flattenIssues(candidates, 'errors');
    const warnings = flattenIssues(candidates, 'warnings');
    const status = summary.failedRows > 0 && summary.importedRows === 0 ? 'failed' : 'completed';
    const finalized = await finalizeImportRun({
        importRun,
        summary,
        errors,
        warnings,
        startedAt,
        status,
        metadata: {
            strictMode: options.strictMode,
            duplicatePolicy: options.duplicatePolicy
        },
        sourceRows: rows
    });

    const hasImportedRows = summary.importedRows > 0;
    const hasFailedRows = summary.failedRows > 0;

    return {
        success: hasImportedRows || !hasFailedRows,
        statusCode: hasImportedRows ? 201 : (hasFailedRows ? 400 : 200),
        message: makeMessage(normalizedEntityType, summary),
        code: summary.importedRows === 0 && summary.failedRows > 0 ? 'IMPORT_VALIDATION_FAILED' : undefined,
        entityType: normalizedEntityType,
        summary,
        errors,
        warnings,
        sample: buildSample(candidates, options.sampleLimit),
        importRunId: importRun._id,
        errorReportUrl: finalized.errorReportUrl,
        capacity: mapCapacityForResponse(entityCapacity),
        strictMode: options.strictMode,
        duplicatePolicy: options.duplicatePolicy,
        idempotent: false
    };
};
