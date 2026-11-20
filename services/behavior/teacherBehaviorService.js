import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { behaviorRoles, canManageBehaviorAdmin, canApproveBehaviorIncident } from './accessService.js';
import { queryBehaviorEvents, behaviorEventPipeline } from './eventQueryService.js';
import { getBehaviorSettings } from './settingsService.js';
import { recordBehaviorAudit } from './auditService.js';
import Student from '../../models/Student.js';
import Class from '../../models/Class.js';
import StudentBehavior from '../../models/StudentBehavior.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../../helpers/teacherScoping.js';
import { resolveAcademicYearForRequest } from '../../helpers/academicYearScope.js';
import { inferAcademicYear } from '../../utils/academicYear.js';
import {
    categoryByKey,
    SEVERITY_TO_STORED,
    STORED_SEVERITY_TO_TEACHER,
    STORED_SEVERITIES_FOR_FILTER,
    NO_NOTE_PLACEHOLDER
} from '../../constants/teacherBehavior.js';

const badRequest = (message, code) => Object.assign(new Error(message), { statusCode: 400, code });
const forbidden = (message, code) => Object.assign(new Error(message), { statusCode: 403, code });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

export const DAY_MS = 24 * 60 * 60 * 1000;

export const startOfDay = (date = new Date()) => {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
};

export const startOfWeek = (date = new Date()) => {
    const value = startOfDay(date);
    const offset = (value.getDay() + 6) % 7; // Monday is the first day
    value.setDate(value.getDate() - offset);
    return value;
};

export const mapStoredSeverity = (stored) => STORED_SEVERITY_TO_TEACHER[stored] || 'minor';

export const resolveIncidentType = ({ category, severity }) => {
    if (severity === 'serious') return 'major_infraction';
    return categoryByKey(category)?.incidentType || 'minor_infraction';
};

const linkedClassIds = (student) => [
    student?.currentClass,
    ...(student?.enrolledClasses || [])
].filter(Boolean).map((id) => String(id));

export const matchedClassId = (student, classIds) => {
    if (!Array.isArray(classIds)) return student?.currentClass ? String(student.currentClass) : null;
    const allowed = new Set(classIds.map((id) => String(id)));
    return linkedClassIds(student).find((id) => allowed.has(id)) || null;
};

export const isStudentInClasses = (student, classIds) => Boolean(matchedClassId(student, classIds));

export const buildFollowUpSuggestion = ({ severity }) => (
    severity === 'serious' ? 'admin_review' : 'conversation'
);

export const buildTrend = ({ recent = 0, previous = 0 }) => ({
    recent,
    previous,
    direction: recent > previous ? 'up' : (recent < previous ? 'down' : 'steady')
});

export const buildAlert = ({ seriousRecent = 0, pendingFollowUps = 0, recent = 0 }) => {
    if (seriousRecent > 0) return 'serious';
    if (pendingFollowUps > 0) return 'follow_up';
    if (recent >= 3) return 'watch';
    return 'steady';
};

const classLabel = (row) => {
    if (!row || typeof row !== 'object' || !row.name) return '';
    return [row.name, row.grade, row.section]
        .filter((part) => String(part || '').trim())
        .join(' • ');
};

const studentDto = (row) => {
    const student = row && typeof row === 'object' ? row : {};
    const id = String(student._id || student.id || '');
    return {
        id,
        name: [student.firstName, student.lastName].filter(Boolean).join(' ').trim(),
        code: String(student.studentId || '').trim(),
        classId: String(student.currentClass || '').trim(),
        className: classLabel(student.currentClass)
    };
};

export const toEntryDto = (row = {}) => {
    const severity = mapStoredSeverity(row.severity);
    const description = String(row.description || '').trim();
    return {
        id: row.source === 'formal' ? `formal:${row._id}` : String(row._id || ''),
        eventId: `${row.source === 'formal' ? 'formal' : 'record'}:${row._id}`,
        source: row.source || 'record',
        formalCase: row.formalCase ? {
            id: String(row.formalCase._id),
            status: row.formalCase.status,
            approverRoles: row.formalCase.approval?.approverRoles || []
        } : null,
        consequenceCounted: Boolean(row.formalCase && !['voided', 'merged'].includes(row.formalCase.status)),
        review: { status: row.review?.status || 'not_required' },
        communication: row.communication || { status: row.parentNotified ? 'recorded' : 'not_sent', method: row.parentNotificationMethod || null },
        followUpAction: row.followUpAction || '',
        followUpDate: row.followUpDate || null,
        student: studentDto(row.student),
        category: row.category || 'other',
        severity,
        isSerious: severity === 'serious',
        notes: description === NO_NOTE_PLACEHOLDER ? '' : description,
        occurredAt: row.incidentDate ? new Date(row.incidentDate).toISOString() : null,
        className: classLabel(row.class),
        followUp: {
            needed: row.followUpRequired === true && !row.followUpCompletedAt,
            completedAt: row.followUpCompletedAt ? new Date(row.followUpCompletedAt).toISOString() : null
        }
    };
};

const entryPopulate = (query) => query
    .populate('student', 'firstName lastName studentId currentClass')
    .populate('class', 'name grade section');

export const teacherClassIdsFor = async (req) => {
    if (canManageBehaviorAdmin(req.user)) return null;
    if (!behaviorRoles(req.user).includes('teacher')) throw forbidden('You cannot access the behavior log.');
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return [];
    return getTeacherClassIds(teacher._id);
};

const resolveScope = async (req) => {
    const filter = { school: req.schoolId, ...(canManageBehaviorAdmin(req.user) ? {} : { isConfidential: { $ne: true } }) };
    const classIds = await teacherClassIdsFor(req);
    if (classIds) {
        if (classIds.length === 0) return { filter: null, classIds };
        filter.class = { $in: classIds };
    }
    return { filter, classIds };
};

const resumeScope = async (req) => {
    const scope = await resolveScope(req);
    if (!scope.filter) throw forbidden('You can only view behavior for students in your classes.');
    return scope;
};

export const studentAccess = async (req, studentId) => {
    if (!mongoose.isValidObjectId(studentId)) throw badRequest('That student could not be found.');

    const student = await Student.findOne({ _id: studentId, school: req.schoolId })
        .select('_id firstName lastName studentId currentClass enrolledClasses academicYear')
        .lean();
    if (!student) throw notFound('That student could not be found.');

    const classIds = await teacherClassIdsFor(req);
    if (classIds) {
        const matched = matchedClassId(student, classIds);
        if (!matched) throw forbidden('You can only record behavior for students in your classes.');
        return { student, classIds, classId: matched };
    }

    return { student, classIds: null, classId: student.currentClass ? String(student.currentClass) : null };
};

const assertOtherStudents = async ({ req, studentIds, classIds }) => {
    if (!studentIds.length) return [];
    const rows = await Student.find({ _id: { $in: studentIds }, school: req.schoolId })
        .select('_id currentClass enrolledClasses')
        .lean();
    if (rows.length !== studentIds.length) throw badRequest('One of the selected students could not be found.');
    if (classIds && rows.some((row) => !isStudentInClasses(row, classIds))) {
        throw forbidden('You can only add students from your classes.');
    }
    return rows.map((row) => row._id);
};

const academicYearFor = async ({ req, student, classId, occurredAt }) => {
    let classYear = null;
    if (classId) {
        const row = await Class.findById(classId).select('academicYear').lean();
        classYear = row?.academicYear || null;
    }
    return classYear
        || student.academicYear
        || resolveAcademicYearForRequest(req)
        || inferAcademicYear(occurredAt, req.school?.settings?.academicYearStartMonth);
};

export const listRoster = async ({ req }) => {
    const classIds = await teacherClassIdsFor(req);
    if (Array.isArray(classIds) && classIds.length === 0) return { students: [] };

    const filter = { school: req.schoolId, status: 'active' };
    if (classIds) {
        filter.$or = [
            { currentClass: { $in: classIds } },
            { enrolledClasses: { $in: classIds } }
        ];
    }

    const rows = await Student.find(filter)
        .select('_id firstName lastName studentId currentClass enrolledClasses')
        .sort({ firstName: 1, lastName: 1 })
        .limit(500)
        .lean();

    const classIdSet = new Set();
    for (const row of rows) {
        for (const id of linkedClassIds(row)) classIdSet.add(id);
    }
    if (classIds) for (const id of classIds) classIdSet.add(String(id));

    const classes = classIdSet.size
        ? await Class.find({ _id: { $in: [...classIdSet] }, school: req.schoolId })
            .select('name grade section')
            .lean()
        : [];
    const classById = new Map(classes.map((row) => [String(row._id), row]));

    const students = rows.map((row) => {
        const chosen = Array.isArray(classIds)
            ? matchedClassId(row, classIds)
            : (row.currentClass ? String(row.currentClass) : null);
        const classDoc = chosen ? classById.get(chosen) : null;
        return {
            id: String(row._id),
            name: [row.firstName, row.lastName].filter(Boolean).join(' ').trim(),
            code: String(row.studentId || '').trim(),
            classId: chosen || '',
            className: classLabel(classDoc)
        };
    });

    return { students };
};

const eventScope = async (req, studentId = null) => ({
    schoolId: req.schoolId,
    studentId,
    classIds: await teacherClassIdsFor(req),
    includeConfidential: canManageBehaviorAdmin(req.user)
});

const eventCounts = async (scope, windows) => {
    const [counts] = await StudentBehavior.aggregate([
        ...behaviorEventPipeline(scope),
        { $facet: Object.fromEntries(Object.entries(windows).map(([key, match]) => [key, [{ $match: match }, { $count: 'value' }]])) }
    ]);
    return Object.fromEntries(Object.keys(windows).map((key) => [key, counts?.[key]?.[0]?.value || 0]));
};

export const getOverview = async ({ req }) => {
    const scope = await eventScope(req);
    const [counts, recent, roster] = await Promise.all([
        eventCounts(scope, {
            today: { incidentDate: { $gte: startOfDay() } },
            week: { incidentDate: { $gte: startOfWeek() } },
            needsFollowUp: { followUpRequired: true, followUpCompletedAt: null },
            serious: { incidentDate: { $gte: startOfWeek() }, severity: { $in: ['high', 'critical'] } }
        }),
        listEntries({ req, limit: 20 }),
        listRoster({ req })
    ]);
    return { counts, recent: recent.items, studentCount: roster.students.length };
};

export const listEntries = async ({ req, range = 'all', studentId = null, severity = null, limit = 50, offset = 0, followUp = false, review = false, classId = null }) => {
    const scope = await eventScope(req, studentId);
    if (studentId) await studentAccess(req, studentId);
    if (classId) {
        if (scope.classIds && !scope.classIds.some((id) => String(id) === classId)) throw forbidden('This class is not assigned to you.');
        scope.classIds = [classId];
    }
    const match = {};
    if (severity) match.severity = { $in: STORED_SEVERITIES_FOR_FILTER[severity] || [] };
    if (range === 'today') match.incidentDate = { $gte: startOfDay() };
    if (range === 'week') match.incidentDate = { $gte: startOfWeek() };
    if (followUp) Object.assign(match, { followUpRequired: true, followUpCompletedAt: null });
    if (review) match.$or = [{ 'review.status': 'pending' }, { 'formalCase.status': 'pending_approval' }, { 'communication.status': 'awaiting_review' }];
    const result = await queryBehaviorEvents({ ...scope, match, offset, limit: Math.min(Math.max(Number(limit) || 50, 1), 100) });
    return { items: result.items.map(toEntryDto), total: result.total };
};

export const createEntry = async ({ req, payload }) => {
    const { student, classIds, classId } = await studentAccess(req, payload.student);
    const category = categoryByKey(payload.category);
    if (!category) throw badRequest('Select a category.');

    const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
    const notes = String(payload.notes || '').trim();
    const serious = payload.severity === 'serious';
    const followUpRequired = serious || payload.followUp === true;

    const otherIds = [...new Set((payload.otherStudents || []).map(String))]
        .filter((id) => id !== String(student._id));
    const otherStudents = await assertOtherStudents({ req, studentIds: otherIds, classIds });

    const requestFingerprint = createHash('sha256').update(JSON.stringify([
        payload.student, payload.category, payload.severity, notes, payload.occurredAt || null,
        otherIds.sort(), followUpRequired, payload.followUpAction || '', payload.followUpDate || null,
        payload.originalDescription || ''
    ])).digest('hex');
    const requestScope = { school: req.schoolId, reportedBy: req.user._id, requestKey: payload.requestKey };
    if (payload.requestKey) {
        const previous = await entryPopulate(StudentBehavior.findOne(requestScope).select('+requestFingerprint')).lean();
        if (previous) {
            if (previous.requestFingerprint !== requestFingerprint) throw Object.assign(new Error('This save was already used for different details. Start a new record.'), { statusCode: 409, code: 'SAVE_CONFLICT' });
            return { entry: toEntryDto(previous), followUp: { key: buildFollowUpSuggestion({ severity: payload.severity }) } };
        }
    }

    const fields = {
        student: student._id,
        school: req.schoolId,
        class: classId || undefined,
        academicYear: await academicYearFor({ req, student, classId, occurredAt }),
        incidentType: resolveIncidentType({ category: category.key, severity: payload.severity }),
        category: category.key,
        severity: SEVERITY_TO_STORED[payload.severity],
        title: category.label,
        description: notes || NO_NOTE_PLACEHOLDER,
        incidentDate: occurredAt,
        reportedBy: req.user._id,
        otherStudentsInvolved: otherStudents,
        followUpRequired,
        followUpDate: followUpRequired ? (payload.followUpDate ? new Date(payload.followUpDate) : occurredAt) : undefined,
        followUpAction: payload.followUpAction || '',
        followUpOwner: followUpRequired ? req.user._id : undefined,
        originalDescription: payload.originalDescription || undefined,
        review: { required: serious, status: serious ? 'pending' : 'not_required' },
        ...(payload.requestKey ? { requestKey: payload.requestKey, requestFingerprint } : {})
    };
    let created;
    try {
        created = await StudentBehavior.create(fields);
    } catch (error) {
        if (error.code !== 11000 || !payload.requestKey) throw error;
        const previous = await entryPopulate(StudentBehavior.findOne(requestScope).select('+requestFingerprint')).lean();
        if (!previous || previous.requestFingerprint !== requestFingerprint) throw Object.assign(new Error('This save was already used for different details.'), { statusCode: 409, code: 'SAVE_CONFLICT' });
        return { entry: toEntryDto(previous), followUp: { key: buildFollowUpSuggestion({ severity: payload.severity }) } };
    }
    await recordBehaviorAudit({ schoolId: req.schoolId, actor: req.user, action: 'routine_record_created', targetType: 'StudentBehavior', targetId: created._id });
    const saved = await entryPopulate(StudentBehavior.findOne({ _id: created._id, school: req.schoolId })).lean();
    return { entry: toEntryDto(saved), followUp: { key: buildFollowUpSuggestion({ severity: payload.severity }) } };
};

export const getStudentSummary = async ({ req, studentId }) => {
    const { student } = await studentAccess(req, studentId);
    const now = new Date();
    const recentStart = new Date(now.getTime() - 14 * DAY_MS);
    const previousStart = new Date(now.getTime() - 28 * DAY_MS);

    const scope = await eventScope(req, studentId);
    const [history, counts] = await Promise.all([
        listEntries({ req, studentId, limit: 20 }),
        eventCounts(scope, {
            recent: { incidentDate: { $gte: recentStart } },
            previous: { incidentDate: { $gte: previousStart, $lt: recentStart } },
            pendingFollowUps: { followUpRequired: true, followUpCompletedAt: null },
            seriousRecent: { incidentDate: { $gte: recentStart }, severity: { $in: ['high', 'critical'] } }
        })
    ]);
    return {
        student: studentDto(student),
        entries: history.items,
        trend: buildTrend(counts),
        alert: { key: buildAlert(counts) },
        pendingFollowUps: counts.pendingFollowUps,
        suggestedFollowUp: history.items.length ? { key: buildFollowUpSuggestion(history.items[0]) } : null
    };
};

export const requireEntry = async (req, entryId) => {
    if (!mongoose.isValidObjectId(entryId)) throw notFound('That entry could not be found.');
    const scope = await resumeScope(req);
    const entry = await StudentBehavior.findOne({ ...scope.filter, _id: entryId });
    if (!entry) throw notFound('That entry could not be found.');
    await studentAccess(req, entry.student);
    return entry;
};

export const completeFollowUp = async ({ req, entryId, note }) => {
    const entry = await requireEntry(req, entryId);
    if (!entry.followUpRequired) throw badRequest('This entry does not need a follow-up.');
    if (entry.review?.status === 'pending') throw badRequest('An authorized reviewer must review this serious record first.', 'REVIEW_REQUIRED');
    const changed = await StudentBehavior.updateOne(
        { _id: entry._id, school: req.schoolId, followUpCompletedAt: null, 'review.status': { $ne: 'pending' } },
        { $set: { followUpCompletedAt: new Date(), followUpCompletedBy: req.user._id, followUpNotes: String(note || '').trim() } }
    );
    if (changed.modifiedCount) await recordBehaviorAudit({ schoolId: req.schoolId, actor: req.user, action: 'routine_follow_up_completed', targetType: 'StudentBehavior', targetId: entry._id });
    const saved = await entryPopulate(StudentBehavior.findOne({ _id: entry._id, school: req.schoolId })).lean();
    return { entry: toEntryDto(saved) };
};

export const reviewEntry = async ({ req, entryId, note }) => {
    const entry = await requireEntry(req, entryId);
    const settings = await getBehaviorSettings(req.schoolId);
    if (!canApproveBehaviorIncident(req.user, settings)) throw forbidden('Your role cannot review this record.');
    await StudentBehavior.updateOne(
        { _id: entry._id, school: req.schoolId, 'review.status': 'pending' },
        { $set: { 'review.status': 'reviewed', 'review.reviewedBy': req.user._id, 'review.reviewedAt': new Date(), 'review.note': note || '' } }
    );
    await recordBehaviorAudit({ schoolId: req.schoolId, actor: req.user, action: 'routine_record_reviewed', targetType: 'StudentBehavior', targetId: entry._id });
    return { reviewed: true };
};
