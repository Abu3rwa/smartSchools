import mongoose from 'mongoose';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Subject from '../models/Subject.js';
import Teacher from '../models/Teacher.js';
import { isHomeroomSubject } from './plpAccessService.js';
import SupportCheckIn from '../models/SupportCheckIn.js';
import SupportCycle from '../models/SupportCycle.js';
import SupportPlan from '../models/SupportPlan.js';
import SupportSurvey from '../models/SupportSurvey.js';
import {
    ensureInternalRespondent,
    ensureParentRespondent,
    supportError,
} from './supportAccessService.js';
import {
    createSurvey,
    surveyStatusCounts,
} from './supportSurveyService.js';
import { analyzeSurveys } from './supportPlanBuilder.js';
import {
    serializePlan,
    serializeRespondent,
    serializeSurvey,
    studentSummary,
} from './supportSerializers.js';

const ACADEMIC_YEAR_START = (academicYear) => {
    const parsed = Number.parseInt(String(academicYear || '').slice(0, 4), 10);
    return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
};

export const monthEnd = (academicYear, month) => {
    const startYear = ACADEMIC_YEAR_START(academicYear);
    const calendarYear = month >= 8 ? startYear : startYear + 1;
    return new Date(calendarYear, month, 0, 23, 59, 59, 999);
};

export const currentMonth = () => new Date().getMonth() + 1;

const personName = (person) => `${person?.firstName || ''} ${person?.lastName || ''}`.trim();

export const teacherClassIds = async (schoolId, userId) => {
    const teachers = await Teacher.find({ school: schoolId, user: userId }).select('_id').lean();
    if (!teachers.length) return [];
    const ids = teachers.map((teacher) => teacher._id);
    return Class.find({
        school: schoolId,
        $or: [{ classTeacher: { $in: ids } }, { 'subjects.teacher': { $in: ids } }],
    }).select('_id').lean();
};

// Homeroom is recorded in three places depending on how the class was set up:
// Class.classTeacher, an HMRM/advisory subject on the class, or the teacher's
// own assignedClasses list. All three must count.
const homeroomAccess = async ({ schoolId, academicYear, user }) => {
    const teachers = await Teacher.find({ school: schoolId, user: user._id })
        .select('_id assignedClasses')
        .lean();
    if (!teachers.length) return null;
    const teacherIds = teachers.map((teacher) => teacher._id);

    const subjects = await Subject.find({ school: schoolId }).select('_id name code').lean();
    const homeroomSubjectIds = subjects.filter(isHomeroomSubject).map((subject) => subject._id);
    const homeroomSubjectSet = new Set(homeroomSubjectIds.map((id) => String(id)));

    const classIds = new Set();
    if (homeroomSubjectIds.length) {
        const subjectClasses = await Class.find({
            school: schoolId,
            academicYear,
            isActive: true,
            subjects: {
                $elemMatch: {
                    teacher: { $in: teacherIds },
                    subject: { $in: homeroomSubjectIds },
                },
            },
        }).select('_id').lean();
        subjectClasses.forEach((classDoc) => classIds.add(String(classDoc._id)));
    }

    for (const teacher of teachers) {
        for (const entry of teacher.assignedClasses || []) {
            if (!entry?.class) continue;
            const subjectId = entry.subject?._id || entry.subject;
            if (entry.isClassTeacher || (subjectId && homeroomSubjectSet.has(String(subjectId)))) {
                classIds.add(String(entry.class));
            }
        }
    }

    return { teacherIds, classIds: [...classIds] };
};

// An admin who also holds a teacher role runs support as their homeroom,
// not as a whole-school overseer. Pure admins and super admins see everything.
const scopesToHomeroom = (user) => {
    if (!user || user.role === 'super_admin') return false;
    const roles = user.roles?.length ? user.roles : [user.role];
    return user.role === 'teacher' || roles.includes('teacher');
};

export const listClassesForUser = async ({ schoolId, user, academicYear, fallbackAcademicYear = null }) => {
    const scopeToHomeroom = scopesToHomeroom(user);
    const runQuery = async (year, access) => {
        const query = { school: schoolId, academicYear: year, isActive: true };
        if (scopeToHomeroom) {
            query.$or = [
                { classTeacher: { $in: access.teacherIds } },
                { _id: { $in: access.classIds } },
            ];
        }
        return Class.find(query)
            .select('name grade section classTeacher academicYear')
            .populate({ path: 'classTeacher', select: 'user' })
            .sort({ grade: 1, name: 1 })
            .lean();
    };

    let effectiveYear = academicYear;
    let access = { teacherIds: [], classIds: [] };
    if (scopeToHomeroom) {
        const resolved = await homeroomAccess({ schoolId, academicYear, user });
        if (!resolved) return { classes: [], academicYear };
        access = resolved;
    }

    let classes = await runQuery(academicYear, access);

    // A homeroom-scoped account with no homeroom in the requested year (e.g. a stale
    // year header on an admin account) still gets their class: try the school's real
    // current year first, then any other year the school has classes in, newest first.
    if (scopeToHomeroom && classes.length === 0) {
        const candidates = [];
        if (fallbackAcademicYear && fallbackAcademicYear !== academicYear) candidates.push(fallbackAcademicYear);
        const knownYears = await Class.distinct('academicYear', { school: schoolId });
        for (const year of [...knownYears].sort().reverse()) {
            if (year !== academicYear && !candidates.includes(year)) candidates.push(year);
        }
        for (const year of candidates) {
            const fallbackAccess = await homeroomAccess({ schoolId, academicYear: year, user });
            if (!fallbackAccess) continue;
            const fallbackClasses = await runQuery(year, fallbackAccess);
            if (fallbackClasses.length > 0) {
                classes = fallbackClasses;
                access = fallbackAccess;
                effectiveYear = year;
                break;
            }
        }
    }

    const homeroomIds = new Set(access.classIds.map((id) => String(id)));
    return {
        academicYear: effectiveYear,
        classes: classes.map((classDoc) => ({
            id: String(classDoc._id),
            name: classDoc.name,
            grade: classDoc.grade,
            section: classDoc.section || '',
            isHomeroom: !scopeToHomeroom
                || homeroomIds.has(String(classDoc._id))
                || (classDoc.classTeacher?.user && String(classDoc.classTeacher.user) === String(user._id)),
        })),
    };
};

export const loadClass = async ({ schoolId, academicYear, classId }) => {
    if (!mongoose.isValidObjectId(classId)) {
        throw supportError(400, 'CLASS_INVALID', 'Choose a class.');
    }
    const classDoc = await Class.findOne({ _id: classId, school: schoolId, academicYear })
        .populate({ path: 'classTeacher', select: 'user', populate: { path: 'user', select: 'firstName lastName email' } })
        .populate('subjects.subject', 'name code')
        .populate({ path: 'subjects.teacher', select: 'user', populate: { path: 'user', select: 'firstName lastName email' } });
    if (!classDoc) throw supportError(404, 'CLASS_NOT_FOUND', 'That class was not found.');
    return classDoc;
};

export const assertClassManager = async ({ schoolId, user, classDoc }) => {
    const isAdminRole = ['admin', 'super_admin'].includes(user.role);
    if (isAdminRole && !scopesToHomeroom(user)) return;
    if (!isAdminRole && user.role !== 'teacher') {
        throw supportError(403, 'CLASS_FORBIDDEN', 'Only the homeroom teacher or an admin can manage support plans.');
    }
    const access = await homeroomAccess({
        schoolId,
        academicYear: classDoc.academicYear,
        user,
    });
    if (!access) {
        throw supportError(403, 'CLASS_FORBIDDEN', 'Only the homeroom teacher or an admin can manage support plans.');
    }
    const teacherIds = access.teacherIds.map((id) => String(id));
    const homeroomId = String(classDoc.classTeacher?._id || classDoc.classTeacher || '');
    const isClassTeacher = Boolean(homeroomId) && teacherIds.includes(homeroomId);
    const teachesHomeroom = access.classIds.some((id) => String(id) === String(classDoc._id));
    if (!isClassTeacher && !teachesHomeroom) {
        throw supportError(403, 'CLASS_FORBIDDEN', 'Only the homeroom teacher or an admin can manage support plans.');
    }
};

export const assertCycleManager = async ({ schoolId, user, cycle }) => {
    const classDoc = await loadClass({ schoolId, academicYear: cycle.academicYear, classId: cycle.class });
    await assertClassManager({ schoolId, user, classDoc });
};

const getStudents = async ({ schoolId, academicYear, classId, studentIds = null }) => {
    const query = { school: schoolId, currentClass: classId, academicYear };
    if (Array.isArray(studentIds) && studentIds.length > 0) {
        query._id = { $in: studentIds.filter((id) => mongoose.isValidObjectId(id)) };
    }
    return Student.find(query)
        .select('firstName lastName gender academicYear currentClass parentInfo')
        .populate('currentClass', 'name grade section')
        .sort({ firstName: 1, lastName: 1 })
        .lean();
};

const previousCycleFor = async ({ schoolId, studentId, academicYear }) => SupportCycle.findOne({
    school: schoolId,
    student: studentId,
    academicYear,
    status: { $in: ['draft', 'active'] },
}).sort({ createdAt: -1 });

const previousSurveysFor = async ({ schoolId, cycleId }) => {
    if (!cycleId) return [];
    return SupportSurvey.find({ school: schoolId, cycle: cycleId, status: 'submitted' });
};

const ensureSurvey = async (params) => {
    const { schoolId, cycleId, audience, subjectId = null, respondentId } = params;
    const query = {
        school: schoolId,
        cycle: cycleId,
        respondent: respondentId,
        audience,
    };
    if (audience === 'teacher') query.subject = subjectId;
    const existing = await SupportSurvey.findOne(query);
    if (existing) return existing;
    return createSurvey(params);
};

/**
 * Create the month's cycle for every selected student, with one survey per
 * subject teacher and one for the family. Re-running is safe: existing cycles
 * and surveys are kept.
 */
export const createCyclesForClass = async ({
    schoolId,
    academicYear,
    user,
    classId,
    month,
    studentIds = null,
    actorId,
}) => {
    const classDoc = await loadClass({ schoolId, academicYear, classId });
    await assertClassManager({ schoolId, user, classDoc });

    const monthNumber = Number(month) || currentMonth();
    if (monthNumber < 1 || monthNumber > 12) {
        throw supportError(400, 'MONTH_INVALID', 'Choose a month between January and December.');
    }

    const students = await getStudents({ schoolId, academicYear, classId, studentIds });
    const homeroomTeacher = classDoc.classTeacher?.user?._id || actorId;
    const dueDate = monthEnd(academicYear, monthNumber);
    const created = [];
    const parentCodes = [];

    for (const student of students) {
        let cycle = await SupportCycle.findOne({
            school: schoolId,
            student: student._id,
            academicYear,
            month: monthNumber,
        });
        const previous = await previousCycleFor({ schoolId, studentId: student._id, academicYear });
        const round = cycle?.round || ((previous?.round || 0) + 1);
        const previousSurveys = cycle
            ? []
            : await previousSurveysFor({ schoolId, cycleId: previous?._id });

        if (!cycle) {
            cycle = await SupportCycle.create({
                school: schoolId,
                academicYear,
                student: student._id,
                class: classId,
                homeroomTeacher,
                month: monthNumber,
                round,
                status: 'active',
                surveyDueDate: dueDate,
                previousCycle: previous?._id || null,
                createdBy: actorId,
                updatedBy: actorId,
            });
            created.push(String(cycle._id));
        }

        const parentResult = await ensureParentRespondent({
            schoolId,
            student,
            actorId,
        });
        if (parentResult.code) {
            parentCodes.push({
                student: studentSummary(student),
                respondentId: String(parentResult.respondent._id),
                code: parentResult.code,
            });
        }
        await ensureSurvey({
            schoolId,
            cycleId: cycle._id,
            studentId: student._id,
            audience: 'parent',
            respondentId: parentResult.respondent._id,
            round,
            previousSurveys,
            dueDate,
            actorId,
        });

        for (const entry of classDoc.subjects || []) {
            const subject = entry.subject;
            const teacherUser = entry.teacher?.user;
            if (!subject || !teacherUser) continue;
            const teacherResult = await ensureInternalRespondent({
                schoolId,
                teacherUserId: teacherUser._id,
                actorId,
            });
            await ensureSurvey({
                schoolId,
                cycleId: cycle._id,
                studentId: student._id,
                audience: 'teacher',
                subjectId: subject._id,
                respondentId: teacherResult.respondent._id,
                round,
                previousSurveys,
                dueDate,
                actorId,
            });
        }
    }

    return { cyclesCreated: created.length, students: students.length, parentCodes };
};

export const listCyclesForClass = async ({ schoolId, academicYear, classId, month }) => {
    const monthNumber = Number(month) || currentMonth();
    const classDoc = await loadClass({ schoolId, academicYear, classId });
    const students = await getStudents({ schoolId, academicYear, classId });
    const cycles = await SupportCycle.find({
        school: schoolId,
        academicYear,
        class: classId,
        month: monthNumber,
    });
    const cycleIds = cycles.map((cycle) => cycle._id);
    const [surveys, plans] = await Promise.all([
        SupportSurvey.find({ school: schoolId, cycle: { $in: cycleIds } }).lean(),
        SupportPlan.find({ school: schoolId, cycle: { $in: cycleIds } }).lean(),
    ]);

    const rows = students.map((student) => {
        const cycle = cycles.find((doc) => String(doc.student) === String(student._id));
        const studentSurveys = surveys.filter((survey) => String(survey.cycle) === String(cycle?._id));
        const plan = plans.find((doc) => String(doc.cycle) === String(cycle?._id));
        return {
            student: studentSummary(student),
            cycleId: cycle ? String(cycle._id) : null,
            status: cycle?.status || null,
            counts: surveyStatusCounts(studentSurveys),
            plan: plan ? { id: String(plan._id), status: plan.status, publishedAt: plan.publishedAt } : null,
        };
    });

    return {
        class: {
            id: String(classDoc._id),
            name: classDoc.name,
            grade: classDoc.grade,
            section: classDoc.section || '',
        },
        month: monthNumber,
        academicYear,
        dueDate: monthEnd(academicYear, monthNumber),
        rows,
    };
};

export const loadCycle = async ({ schoolId, cycleId, user }) => {
    if (!mongoose.isValidObjectId(cycleId)) {
        throw supportError(400, 'CYCLE_INVALID', 'Choose a support cycle.');
    }
    const cycle = await SupportCycle.findOne({ _id: cycleId, school: schoolId })
        .populate('student', 'firstName lastName gender academicYear currentClass parentInfo')
        .populate({ path: 'student', populate: { path: 'currentClass', select: 'name grade section' } })
        .populate('class', 'name grade section')
        .populate('homeroomTeacher', 'firstName lastName email');
    if (!cycle) throw supportError(404, 'CYCLE_NOT_FOUND', 'That support cycle was not found.');
    await assertCycleManager({ schoolId, user, cycle });
    return cycle;
};

export const cycleDetail = async ({ schoolId, cycle }) => {
    const [surveys, plan, classDoc] = await Promise.all([
        SupportSurvey.find({ school: schoolId, cycle: cycle._id })
            .populate('subject', 'name')
            .populate({
                path: 'respondent',
                select: 'kind name email codeHint lastAccessAt teacher',
                populate: { path: 'teacher', select: 'firstName lastName email' },
            }),
        SupportPlan.findOne({ school: schoolId, cycle: cycle._id }),
        Class.findOne({ _id: cycle.class?._id || cycle.class, school: schoolId }).populate('subjects.subject', 'name'),
    ]);

    const checkInDocs = plan
        ? await SupportCheckIn.find({ school: schoolId, plan: plan._id }).lean()
        : [];
    const analysis = analyzeSurveys(surveys);
    const comments = [];
    for (const survey of surveys) {
        if (survey.status !== 'submitted') continue;
        for (const question of survey.questions || []) {
            const answer = (survey.answers || []).find((row) => row.questionId === question.id);
            if (!answer) continue;
            if (question.kind === 'text' && String(answer.textValue || '').trim()) {
                comments.push({
                    audience: survey.audience,
                    subject: survey.subject?.name || '',
                    text: String(answer.textValue).trim(),
                });
            } else if (question.allowComment && String(answer.textValue || '').trim()) {
                comments.push({
                    audience: survey.audience,
                    subject: survey.subject?.name || '',
                    text: String(answer.textValue).trim(),
                });
            }
        }
    }

    return {
        cycle: {
            id: String(cycle._id),
            month: cycle.month,
            round: cycle.round,
            academicYear: cycle.academicYear,
            status: cycle.status,
            dueDate: cycle.surveyDueDate,
            homeroomTeacher: personName(cycle.homeroomTeacher),
            student: studentSummary(cycle.student),
            class: cycle.class
                ? { id: String(cycle.class._id), name: cycle.class.name, grade: cycle.class.grade }
                : null,
        },
        surveys: surveys.map((survey) => serializeSurvey(survey)),
        respondents: surveys.map((survey) => ({
            ...serializeRespondent(survey.respondent),
            surveyId: String(survey._id),
            surveyStatus: survey.status,
            submittedAt: survey.submittedAt,
            subject: survey.subject ? { id: String(survey.subject._id), name: survey.subject.name } : null,
            audience: survey.audience,
        })),
        plan: serializePlan(plan, checkInDocs),
        analysis: {
            teacherCount: analysis.teacherCount,
            parentCount: analysis.parentCount,
            scores: analysis.scores,
        },
        comments,
        subjects: (classDoc?.subjects || [])
            .filter((entry) => entry.subject)
            .map((entry) => ({ id: String(entry.subject._id), name: entry.subject.name })),
    };
};

export const addExternalTeacher = async ({
    schoolId,
    cycle,
    name,
    email,
    subjectId,
    actorId,
}) => {
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanName || !cleanEmail) {
        throw supportError(400, 'EXTERNAL_FIELDS', 'Add the teacher name and email.');
    }
    if (!mongoose.isValidObjectId(subjectId)) {
        throw supportError(400, 'SUBJECT_INVALID', 'Choose the subject this teacher covers.');
    }
    const classDoc = await Class.findOne({
        _id: cycle.class,
        school: schoolId,
        academicYear: cycle.academicYear,
    }).populate('subjects.subject', 'name');
    if (!classDoc) throw supportError(404, 'CLASS_NOT_FOUND', 'That class was not found.');

    let subject = classDoc.subjects.find((entry) => String(entry.subject?._id) === String(subjectId))?.subject;
    if (!subject) {
        subject = await mongoose.model('Subject').findOne({ _id: subjectId, school: schoolId }).select('name');
    }
    if (!subject) throw supportError(404, 'SUBJECT_NOT_FOUND', 'That subject was not found.');

    const { createExternalRespondent } = await import('./supportAccessService.js');
    const { respondent, code } = await createExternalRespondent({
        schoolId,
        name: cleanName,
        email: cleanEmail,
        actorId,
    });
    const survey = await ensureSurvey({
        schoolId,
        cycleId: cycle._id,
        studentId: cycle.student,
        audience: 'teacher',
        subjectId,
        respondentId: respondent._id,
        round: cycle.round,
        previousSurveys: [],
        dueDate: cycle.surveyDueDate,
        actorId,
    });
    return { respondent: serializeRespondent(respondent), code, surveyId: String(survey._id), subject: { id: String(subject._id), name: subject.name } };
};

export const studentHistory = async ({ schoolId, studentId }) => SupportCycle.find({
    school: schoolId,
    student: studentId,
})
    .populate('class', 'name grade section')
    .sort({ academicYear: -1, createdAt: -1 })
    .limit(12)
    .lean();
