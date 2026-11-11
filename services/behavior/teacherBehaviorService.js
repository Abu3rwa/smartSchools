import mongoose from 'mongoose';
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

/**
 * Recommendation shown right after saving. Repeat counts are same-category
 * occurrences in the last 14 days, including the record being saved.
 */
export const buildFollowUpSuggestion = ({ category, severity, recentCount = 1 }) => {
    if (severity === 'serious') return 'admin_review';
    if (category === 'bullying') return 'counseling_referral';
    if (recentCount >= 4) return 'detention';
    if (recentCount >= 2) return 'parent_contact';
    if (severity === 'moderate') return 'conversation';
    return 'warning_reflection';
};

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
        id: String(row._id || ''),
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

const teacherClassIdsFor = async (req) => {
    if (req.user.role !== 'teacher') return null;
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return [];
    return getTeacherClassIds(teacher._id);
};

const resolveScope = async (req) => {
    const filter = { school: req.schoolId };
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

const studentAccess = async (req, studentId) => {
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

export const getOverview = async ({ req }) => {
    const scope = await resolveScope(req);
    if (!scope.filter) {
        return {
            counts: { today: 0, week: 0, needsFollowUp: 0, serious: 0 },
            recent: [],
            studentCount: 0
        };
    }

    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);

    const studentFilter = { school: req.schoolId, status: 'active' };
    if (scope.classIds) {
        studentFilter.$or = [
            { currentClass: { $in: scope.classIds } },
            { enrolledClasses: { $in: scope.classIds } }
        ];
    }

    const [today, week, needsFollowUp, serious, recentRows, studentCount] = await Promise.all([
        StudentBehavior.countDocuments({ ...scope.filter, incidentDate: { $gte: todayStart } }),
        StudentBehavior.countDocuments({ ...scope.filter, incidentDate: { $gte: weekStart } }),
        StudentBehavior.countDocuments({ ...scope.filter, followUpRequired: true, followUpCompletedAt: null }),
        StudentBehavior.countDocuments({
            ...scope.filter,
            incidentDate: { $gte: weekStart },
            severity: { $in: ['high', 'critical'] }
        }),
        entryPopulate(StudentBehavior.find({ ...scope.filter, incidentDate: { $gte: todayStart } }))
            .sort({ incidentDate: -1 })
            .limit(20)
            .lean(),
        Student.countDocuments(studentFilter)
    ]);

    return {
        counts: { today, week, needsFollowUp, serious },
        recent: recentRows.map(toEntryDto),
        studentCount
    };
};

export const listEntries = async ({ req, range = 'all', studentId = null, severity = null, limit = 50 }) => {
    const scope = await resolveScope(req);
    if (!scope.filter) return { items: [], total: 0 };

    const filter = { ...scope.filter };
    if (studentId) {
        if (!mongoose.isValidObjectId(studentId)) throw badRequest('That student could not be found.');
        filter.student = studentId;
    }
    if (severity) filter.severity = { $in: STORED_SEVERITIES_FOR_FILTER[severity] || [] };
    if (range === 'today') filter.incidentDate = { $gte: startOfDay() };
    if (range === 'week') filter.incidentDate = { $gte: startOfWeek() };

    const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const [rows, total] = await Promise.all([
        entryPopulate(StudentBehavior.find(filter))
            .sort({ incidentDate: -1 })
            .limit(pageSize)
            .lean(),
        StudentBehavior.countDocuments(filter)
    ]);

    return { items: rows.map(toEntryDto), total };
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

    const recentSameCategory = await StudentBehavior.countDocuments({
        school: req.schoolId,
        student: student._id,
        category: category.key,
        incidentDate: { $gte: new Date(occurredAt.getTime() - 14 * DAY_MS) }
    });

    const created = await StudentBehavior.create({
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
        followUpDate: followUpRequired ? occurredAt : undefined
    });

    const saved = await entryPopulate(StudentBehavior.findById(created._id)).lean();

    return {
        entry: toEntryDto(saved),
        followUp: {
            key: buildFollowUpSuggestion({
                category: category.key,
                severity: payload.severity,
                recentCount: recentSameCategory + 1
            })
        }
    };
};

export const getStudentSummary = async ({ req, studentId }) => {
    const { student } = await studentAccess(req, studentId);
    const now = new Date();
    const recentStart = new Date(now.getTime() - 14 * DAY_MS);
    const previousStart = new Date(now.getTime() - 28 * DAY_MS);

    const [rows, recentCount, previousCount, pendingFollowUps, seriousRecent] = await Promise.all([
        entryPopulate(StudentBehavior.find({
            school: req.schoolId,
            student: student._id
        }))
            .sort({ incidentDate: -1 })
            .limit(20)
            .lean(),
        StudentBehavior.countDocuments({ school: req.schoolId, student: student._id, incidentDate: { $gte: recentStart } }),
        StudentBehavior.countDocuments({
            school: req.schoolId,
            student: student._id,
            incidentDate: { $gte: previousStart, $lt: recentStart }
        }),
        StudentBehavior.countDocuments({ school: req.schoolId, student: student._id, followUpRequired: true, followUpCompletedAt: null }),
        StudentBehavior.countDocuments({
            school: req.schoolId,
            student: student._id,
            incidentDate: { $gte: recentStart },
            severity: { $in: ['high', 'critical'] }
        })
    ]);

    const latest = rows[0] || null;
    let suggestedFollowUp = null;
    if (latest) {
        const recentSameCategory = await StudentBehavior.countDocuments({
            school: req.schoolId,
            student: student._id,
            category: latest.category,
            incidentDate: { $gte: recentStart }
        });
        suggestedFollowUp = {
            key: buildFollowUpSuggestion({
                category: latest.category,
                severity: mapStoredSeverity(latest.severity),
                recentCount: recentSameCategory
            })
        };
    }

    return {
        student: studentDto(student),
        entries: rows.map(toEntryDto),
        trend: buildTrend({ recent: recentCount, previous: previousCount }),
        alert: { key: buildAlert({ seriousRecent, pendingFollowUps, recent: recentCount }) },
        pendingFollowUps,
        suggestedFollowUp
    };
};

export const completeFollowUp = async ({ req, entryId, note }) => {
    if (!mongoose.isValidObjectId(entryId)) throw notFound('That entry could not be found.');
    const scope = await resumeScope(req);

    const entry = await StudentBehavior.findOne({ ...scope.filter, _id: entryId });
    if (!entry) throw notFound('That entry could not be found.');
    if (!entry.followUpRequired) throw badRequest('This entry does not need a follow-up.');

    if (!entry.followUpCompletedAt) {
        entry.followUpCompletedAt = new Date();
        entry.followUpCompletedBy = req.user._id;
        entry.followUpNotes = String(note || '').trim();
        await entry.save();
    }

    const saved = await entryPopulate(StudentBehavior.findById(entry._id)).lean();
    return { entry: toEntryDto(saved) };
};
