import mongoose from 'mongoose';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import SupportCase from '../models/SupportCase.js';
import SupportCheckIn from '../models/SupportCheckIn.js';
import SupportPlan from '../models/SupportPlan.js';
import SupportPlanVersion from '../models/SupportPlanVersion.js';
import SupportRespondent from '../models/SupportRespondent.js';
import SupportReview from '../models/SupportReview.js';
import SupportSurvey from '../models/SupportSurvey.js';
import { issueCode } from './supportAccessService.js';
import { supportError } from './supportAccessService.js';
import {
    isCounselor,
    isSupportAdmin,
    loadSettings,
    reviewCadenceFor,
    userRoles,
} from './supportSettingsService.js';

const PARENT_SLOTS = ['mother', 'father', 'guardian'];
const ESCAPE = /[.*+?^${}()|[\]\\]/g;

const escapeRegex = (value) => String(value || '').replace(ESCAPE, '\\$&');

const nameOf = (person) => `${person?.firstName || ''} ${person?.lastName || ''}`.trim();

const validId = (value) => mongoose.isValidObjectId(value);

const uniqueIds = (values = []) => [...new Set(values.filter((value) => validId(value)).map(String))];

/**
 * The active-case check before an insert is only advisory: two nominations can
 * pass it together. The unique index is the real guard, so a racing collision
 * must still answer with the existing case instead of a raw E11000.
 */
const saveNewCase = async (caseDoc) => {
    try {
        await caseDoc.save();
        return caseDoc;
    } catch (error) {
        if (error?.code !== 11000) throw error;
        const existing = await SupportCase.findOne({
            school: caseDoc.school,
            student: caseDoc.student,
            status: 'active',
        });
        throw supportError(409, 'CASE_EXISTS', 'This student already has an active support case.', {
            caseId: existing ? String(existing._id) : null,
        });
    }
};

export const caseAccessContext = ({ caseDoc, user }) => {
    const userId = String(user?._id || '');
    const admin = isSupportAdmin(user);
    const owner = String(caseDoc.owner || '') === userId;
    const homeroom = String(caseDoc.homeroomTeacher || '') === userId;
    const counselorAssigned = String(caseDoc.counselor || '') === userId
        || (isCounselor(user) && (caseDoc.participants || []).some((row) => (
            String(row.user) === userId && row.role === 'counselor' && row.active !== false
        )));
    const participant = (caseDoc.participants || []).some((row) => (
        String(row.user) === userId && row.active !== false
    ));
    return {
        isAdmin: admin,
        isOwner: owner,
        isHomeroom: homeroom,
        isCounselorAssigned: counselorAssigned,
        isParticipant: participant,
        canView: admin || owner || homeroom || counselorAssigned || participant,
        canManage: admin || owner || homeroom || counselorAssigned,
        canSeeStudentRaw: admin || counselorAssigned,
    };
};

const assertView = (context) => {
    if (!context.canView) {
        throw supportError(403, 'CASE_FORBIDDEN', 'This support case is not assigned to you.');
    }
};

const assertManage = (context) => {
    if (!context.canManage) {
        throw supportError(403, 'CASE_FORBIDDEN', 'Only the case owner, homeroom teacher, assigned counselor or an admin can change this case.');
    }
};

export const loadCase = async ({ schoolId, caseId, user, populate = true }) => {
    if (!validId(caseId)) throw supportError(400, 'CASE_INVALID', 'Choose a support case.');
    let query = SupportCase.findOne({ _id: caseId, school: schoolId });
    if (populate) {
        query = query
            .populate('student', 'firstName lastName gender academicYear currentClass dateOfBirth parentInfo')
            .populate({ path: 'student', populate: { path: 'currentClass', select: 'name grade section' } })
            .populate('class', 'name grade section academicYear')
            .populate('homeroomTeacher', 'firstName lastName email')
            .populate('owner', 'firstName lastName email')
            .populate('counselor', 'firstName lastName email')
            .populate('nominator', 'firstName lastName email')
            .populate('participants.user', 'firstName lastName email role')
            .populate('familyContacts.respondent', 'kind student parentSlot name email codeHint deliveryMethod active');
    }
    const caseDoc = await query;
    if (!caseDoc) throw supportError(404, 'CASE_NOT_FOUND', 'That support case was not found.');
    const context = caseAccessContext({ caseDoc, user });
    assertView(context);
    return { caseDoc, context };
};

const settingsForCase = async (schoolId, user) => {
    const settings = await loadSettings(schoolId);
    if (!settings.enabled && !isSupportAdmin(user)) {
        throw supportError(403, 'SUPPORT_DISABLED', 'Student support is not enabled for this school.');
    }
    if (!isSupportAdmin(user) && !isCounselor(user)
        && !userRoles(user).some((role) => settings.roles.includes(role))) {
        throw supportError(403, 'SUPPORT_ROLE', 'Your role is not part of this school\'s support workflow.');
    }
    return settings;
};

const teacherProfileIds = async (schoolId, userId) => {
    const Teacher = mongoose.model('Teacher');
    return Teacher.find({ school: schoolId, user: userId }).select('_id').lean();
};

/** Subject scopes, homeroom teacher and eligible participants for one class. */
export const classScope = async ({ schoolId, academicYear, classId, user }) => {
    if (!validId(classId)) throw supportError(400, 'CLASS_INVALID', 'Choose a class.');
    const classDoc = await Class.findOne({ _id: classId, school: schoolId, academicYear })
        .populate({ path: 'classTeacher', select: 'user' })
        .populate({ path: 'subjects.subject', select: 'name nameAr' })
        .populate({ path: 'subjects.teacher', select: 'user' });
    if (!classDoc) throw supportError(404, 'CLASS_NOT_FOUND', 'That class was not found.');

    const profiles = await teacherProfileIds(schoolId, user?._id);
    const profileIds = profiles.map((row) => String(row._id));
    const homeroomId = String(classDoc.classTeacher?._id || '');
    const homeroomUser = classDoc.classTeacher?.user ? String(classDoc.classTeacher.user) : '';
    const isClassTeacher = homeroomUser === String(user?._id || '') || profileIds.includes(homeroomId);

    const subjects = (classDoc.subjects || [])
        .filter((entry) => entry.subject && entry.teacher?.user)
        .map((entry) => ({
            subjectId: String(entry.subject._id),
            name: entry.subject.name,
            nameAr: entry.subject.nameAr || '',
            teacherUserId: String(entry.teacher.user),
        }));

    return {
        classDoc,
        homeroomUserId: homeroomUser || null,
        isClassTeacher,
        teachesSubject: subjects.some((row) => row.teacherUserId === String(user?._id || '')),
        subjects,
    };
};

const subjectScopeForStudent = async ({ schoolId, academicYear, student, user }) => {
    const classId = student.currentClass?._id || student.currentClass;
    const scope = await classScope({
        schoolId,
        academicYear: student.academicYear || academicYear,
        classId,
        user,
    });
    return { ...scope, classId };
};

const participantDoc = ({ user, role, subject = null }) => ({
    user,
    role,
    subject,
    active: true,
    addedAt: new Date(),
});

/**
 * The selected participants, never the whole class. An explicitly empty list
 * stays empty; defaults only apply when the caller did not choose.
 */
export const resolveParticipants = async ({
    scope,
    subjectIds = [],
    actorId,
    counselorId = null,
    explicitUserIds = null,
}) => {
    const subjectSet = new Set(subjectIds.map(String));
    const rows = [];
    const seen = new Set();
    const add = (doc) => {
        const key = `${String(doc.user)}:${String(doc.subject || '')}`;
        if (seen.has(key) || !doc.user) return;
        seen.add(key);
        rows.push(doc);
    };

    const allowed = new Map();
    if (scope.homeroomUserId) allowed.set(scope.homeroomUserId, 'homeroom');
    for (const subject of scope.subjects) {
        if (subjectSet.has(subject.subjectId)) {
            allowed.set(subject.teacherUserId, 'teacher');
        }
    }
    if (explicitUserIds) {
        for (const raw of uniqueIds(explicitUserIds)) {
            if (!allowed.has(raw) && raw !== String(counselorId || '')) continue;
            for (const subject of scope.subjects) {
                if (String(subject.teacherUserId) === raw && subjectSet.has(subject.subjectId)) {
                    add(participantDoc({ user: raw, role: 'teacher', subject: subject.subjectId }));
                }
            }
            if (raw === scope.homeroomUserId) add(participantDoc({ user: raw, role: 'homeroom' }));
            if (raw === String(counselorId || '')) add(participantDoc({ user: raw, role: 'counselor' }));
        }
        return rows;
    }

    if (scope.homeroomUserId) add(participantDoc({ user: scope.homeroomUserId, role: 'homeroom' }));
    for (const subject of scope.subjects) {
        if (subjectSet.has(subject.subjectId)) {
            add(participantDoc({ user: subject.teacherUserId, role: 'teacher', subject: subject.subjectId }));
        }
    }
    if (actorId && !rows.some((row) => String(row.user) === String(actorId))) {
        add(participantDoc({ user: actorId, role: String(actorId) === String(scope.homeroomUserId) ? 'homeroom' : 'teacher' }));
    }
    if (counselorId) add(participantDoc({ user: counselorId, role: 'counselor' }));
    return rows;
};

const readContactSlots = (student) => {
    const info = student?.parentInfo || {};
    const slots = [];
    for (const slot of PARENT_SLOTS) {
        const name = String(info[`${slot}Name`] || '').trim();
        const email = String(info[`${slot}Email`] || '').trim().toLowerCase();
        if (!name && !email) continue;
        slots.push({ slot, name, email });
    }
    // Two contact fields sharing one address are two people at one mailbox:
    // only the first gets email delivery, the other needs a printed slip.
    const seenEmails = new Set();
    return slots.map((row) => {
        if (row.email && seenEmails.has(row.email)) {
            return { ...row, deliveryMethod: 'printed', sharedEmail: true };
        }
        if (row.email) seenEmails.add(row.email);
        return { ...row, deliveryMethod: row.email ? 'email' : 'printed', sharedEmail: false };
    });
};

export const ensureFamilyContacts = async ({ schoolId, caseDoc, student, contacts = null, actorId = null }) => {
    const selected = Array.isArray(contacts) && contacts.length
        ? contacts.map((row) => ({
            slot: PARENT_SLOTS.includes(row.slot) ? row.slot : 'guardian',
            name: String(row.name || '').trim().slice(0, 120),
            email: String(row.email || '').trim().toLowerCase().slice(0, 200),
            deliveryMethod: ['email', 'printed', 'assisted', 'portal'].includes(row.deliveryMethod)
                ? row.deliveryMethod
                : (row.email ? 'email' : 'printed'),
        }))
        : readContactSlots(student);

    const issued = [];
    const merged = [];
    for (const contact of selected) {
        if (!contact.name && !contact.email) continue;
        let respondent = await SupportRespondent.findOne({
            school: schoolId,
            kind: 'parent',
            student: student._id,
            parentSlot: contact.slot,
        }).select('+codeHash');
        let code = null;
        if (!respondent) {
            respondent = new SupportRespondent({
                school: schoolId,
                kind: 'parent',
                student: student._id,
                parentSlot: contact.slot,
                name: contact.name,
                email: contact.email,
                deliveryMethod: contact.deliveryMethod,
                invitedBy: actorId,
                codeHash: 'pending',
                codeHint: '00',
            });
            code = await issueCode(respondent);
        } else {
            let changed = false;
            if (contact.name && contact.name !== respondent.name) {
                respondent.name = contact.name;
                changed = true;
            }
            if (contact.email && contact.email !== respondent.email) {
                respondent.email = contact.email;
                changed = true;
            }
            if (contact.deliveryMethod && contact.deliveryMethod !== respondent.deliveryMethod) {
                respondent.deliveryMethod = contact.deliveryMethod;
                changed = true;
            }
            if (changed) await respondent.save();
        }
        issued.push({
            respondentId: String(respondent._id),
            slot: contact.slot,
            name: respondent.name || contact.name,
            email: respondent.email,
            deliveryMethod: respondent.deliveryMethod,
            code,
        });
        merged.push({
            respondent: respondent._id,
            slot: contact.slot,
            deliveryMethod: respondent.deliveryMethod,
            email: respondent.email || '',
            name: respondent.name || contact.name,
            active: true,
            addedAt: new Date(),
        });
    }
    caseDoc.familyContacts = merged;
    return issued;
};

export const ensureStudentRespondent = async ({ schoolId, student, actorId = null }) => {
    let respondent = await SupportRespondent.findOne({
        school: schoolId,
        kind: 'student',
        student: student._id,
    });
    if (respondent) return respondent;
    respondent = await SupportRespondent.create({
        school: schoolId,
        kind: 'student',
        student: student._id,
        name: nameOf(student),
        deliveryMethod: 'portal',
        codeHint: 'st',
        invitedBy: actorId,
    });
    return respondent;
};

const studentForNomination = async ({ schoolId, academicYear, studentId, user, subjectIds }) => {
    if (!validId(studentId)) throw supportError(400, 'STUDENT_INVALID', 'Choose a student.');
    const student = await Student.findOne({
        _id: studentId,
        school: schoolId,
        ...(academicYear ? { academicYear } : {}),
    }).populate('currentClass', 'name grade section nameAr');
    if (!student) throw supportError(404, 'STUDENT_NOT_FOUND', 'That student was not found in this school year.');
    if (!student.currentClass) {
        throw supportError(400, 'STUDENT_NO_CLASS', 'This student has no class, so no subject teacher can be assigned.');
    }

    const scope = await subjectScopeForStudent({
        schoolId,
        academicYear: academicYear || student.academicYear,
        student,
        user,
    });
    const allowedSubjects = new Set(scope.subjects.map((row) => row.subjectId));
    const chosen = uniqueIds(subjectIds);
    if (chosen.length === 0) {
        throw supportError(400, 'SUBJECT_REQUIRED', 'Choose at least one subject for this case.');
    }
    if (chosen.some((id) => !allowedSubjects.has(id))) {
        throw supportError(400, 'SUBJECT_FORBIDDEN', 'One of those subjects is not taught in this student\'s class.');
    }

    const admin = isSupportAdmin(user);
    const counselorRole = isCounselor(user);
    const manages = scope.isClassTeacher || scope.teachesSubject
        || scope.subjects.some((row) => chosen.includes(row.subjectId) && row.teacherUserId === String(user._id));
    if (!admin && !counselorRole && !manages) {
        throw supportError(403, 'CASE_NOMINATE_FORBIDDEN', 'You can only open a case for a student you teach.');
    }

    return { student, scope, subjectIds: chosen };
};

export const createCase = async ({
    schoolId,
    user,
    academicYear,
    studentId,
    subjectIds,
    severity = 'support',
    concernNote = '',
    counselorId = null,
    participantUserIds = null,
    familyContacts = null,
    source = 'manual',
    parentRequest = null,
    actorId = null,
}) => {
    const settings = await settingsForCase(schoolId, user);
    const { student, scope, subjectIds: chosen } = await studentForNomination({
        schoolId,
        academicYear,
        studentId,
        user,
        subjectIds,
    });

    const existing = await SupportCase.findOne({
        school: schoolId,
        student: student._id,
        status: 'active',
    });
    if (existing) {
        throw supportError(409, 'CASE_EXISTS', 'This student already has an active support case.', {
            caseId: String(existing._id),
        });
    }

    const ownerId = scope.homeroomUserId || String(user._id);
    const participants = await resolveParticipants({
        scope,
        subjectIds: chosen,
        actorId: user._id,
        counselorId,
        explicitUserIds: participantUserIds,
    });
    const subjects = chosen.map((subjectId) => {
        const row = scope.subjects.find((entry) => entry.subjectId === subjectId);
        const teachers = scope.subjects
            .filter((entry) => entry.subjectId === subjectId)
            .map((entry) => entry.teacherUserId);
        return { subject: subjectId, name: row?.name || '', teachers };
    });

    const caseDoc = new SupportCase({
        school: schoolId,
        student: student._id,
        academicYear: student.academicYear || academicYear,
        class: scope.classId,
        homeroomTeacher: scope.homeroomUserId,
        owner: ownerId,
        counselor: counselorId,
        nominator: user._id,
        source,
        status: 'active',
        severity: ['watch', 'support', 'intensive'].includes(severity) ? severity : 'support',
        subjects,
        participants,
        concernNote: String(concernNote || '').trim().slice(0, 2000),
        cadenceDays: reviewCadenceFor(settings, severity),
        nextReviewAt: new Date(Date.now() + reviewCadenceFor(settings, severity) * 24 * 60 * 60 * 1000),
        openedAt: new Date(),
        createdBy: actorId || user._id,
        updatedBy: actorId || user._id,
        parentRequest: parentRequest || null,
    });

    const issued = await ensureFamilyContacts({
        schoolId,
        caseDoc,
        student,
        contacts: familyContacts,
        actorId: actorId || user._id,
    });
    await saveNewCase(caseDoc);
    return { caseDoc, issued, student };
};

export const updateCase = async ({ schoolId, user, caseDoc, patch = {} }) => {
    const context = caseAccessContext({ caseDoc, user });
    assertManage(context);
    const settings = await loadSettings(schoolId);

    if ('severity' in patch) {
        if (!['watch', 'support', 'intensive'].includes(patch.severity)) {
            throw supportError(400, 'CASE_SEVERITY', 'Choose a severity level.');
        }
        caseDoc.severity = patch.severity;
        caseDoc.cadenceDays = reviewCadenceFor(settings, patch.severity);
        caseDoc.nextReviewAt = new Date(Date.now() + caseDoc.cadenceDays * 24 * 60 * 60 * 1000);
    }
    if ('concernNote' in patch) {
        caseDoc.concernNote = String(patch.concernNote || '').trim().slice(0, 2000);
    }
    if ('studentVoice' in patch) {
        if (!['inherit', 'on', 'off'].includes(patch.studentVoice)) {
            throw supportError(400, 'CASE_VOICE', 'Choose whether student voice follows the school rule.');
        }
        caseDoc.studentVoice = patch.studentVoice;
    }
    if ('studentEvidenceInPlan' in patch) {
        caseDoc.studentEvidenceInPlan = patch.studentEvidenceInPlan === true;
    }
    if ('owner' in patch) {
        if (!validId(patch.owner)) throw supportError(400, 'CASE_OWNER', 'Choose a case owner.');
        const isParticipant = (caseDoc.participants || []).some((row) => String(row.user) === String(patch.owner));
        if (!isParticipant && String(caseDoc.homeroomTeacher || '') !== String(patch.owner) && !context.isAdmin) {
            throw supportError(400, 'CASE_OWNER', 'The owner must already participate in this case.');
        }
        caseDoc.owner = patch.owner;
    }
    if ('counselor' in patch) {
        if (patch.counselor && !validId(patch.counselor)) {
            throw supportError(400, 'CASE_COUNSELOR', 'Choose a counselor.');
        }
        caseDoc.counselor = patch.counselor || null;
    }
    if ('cadenceDays' in patch) {
        const days = Number(patch.cadenceDays);
        if (!Number.isInteger(days) || days < 1 || days > 180) {
            throw supportError(400, 'CASE_CADENCE', 'The review interval must be 1 to 180 days.');
        }
        caseDoc.cadenceDays = days;
    }
    if ('nextReviewAt' in patch) {
        const value = patch.nextReviewAt ? new Date(patch.nextReviewAt) : null;
        if (value && Number.isNaN(value.getTime())) {
            throw supportError(400, 'CASE_REVIEW_DATE', 'Choose a valid review date.');
        }
        caseDoc.nextReviewAt = value;
    }
    if ('participants' in patch) {
        if (!Array.isArray(patch.participants)) {
            throw supportError(400, 'CASE_PARTICIPANTS', 'Participants must be a list.');
        }
        const current = new Map((caseDoc.participants || []).map((row) => [String(row.user), row]));
        const next = [];
        for (const raw of patch.participants) {
            if (!validId(raw.user)) continue;
            const existing = current.get(String(raw.user));
            next.push(existing
                ? { ...existing.toObject(), active: raw.active !== false }
                : participantDoc({ user: raw.user, role: raw.role || 'teacher', subject: raw.subject || null }));
        }
        caseDoc.participants = next;
    }
    caseDoc.updatedBy = user._id;
    await caseDoc.save();
    return caseDoc;
};

export const addCaseNote = async ({ caseDoc, user, text }) => {
    const context = caseAccessContext({ caseDoc, user });
    assertManage(context);
    const clean = String(text || '').trim().slice(0, 2000);
    if (!clean) throw supportError(400, 'NOTE_EMPTY', 'Write the note first.');
    caseDoc.notes.push({ text: clean, by: user._id, at: new Date() });
    caseDoc.updatedBy = user._id;
    await caseDoc.save();
    return caseDoc;
};

export const closeCase = async ({ caseDoc, user, reason, summary }) => {
    const context = caseAccessContext({ caseDoc, user });
    assertManage(context);
    if (caseDoc.status === 'closed') {
        throw supportError(409, 'CASE_CLOSED', 'This case is already closed.');
    }
    if (!['goal_met', 'stepped_down', 'moved_school', 'referred', 'other'].includes(reason)) {
        throw supportError(400, 'CASE_CLOSE_REASON', 'Choose a closure reason.');
    }
    caseDoc.status = 'closed';
    caseDoc.closedAt = new Date();
    caseDoc.closedBy = user._id;
    caseDoc.closeReason = reason;
    caseDoc.closeSummary = String(summary || '').trim().slice(0, 1200);
    caseDoc.updatedBy = user._id;
    await caseDoc.save();
    return caseDoc;
};

export const addFamilyContact = async ({ schoolId, caseDoc, user, contact }) => {
    const context = caseAccessContext({ caseDoc, user });
    assertManage(context);
    const student = await Student.findById(caseDoc.student);
    if (!student) throw supportError(404, 'STUDENT_NOT_FOUND', 'That student was not found.');
    const existing = (caseDoc.familyContacts || []).map((row) => ({
        slot: row.slot,
        name: row.name,
        email: row.email,
        deliveryMethod: row.deliveryMethod,
    }));
    const merged = [...existing.filter((row) => row.slot !== contact.slot), contact];
    const issued = await ensureFamilyContacts({
        schoolId,
        caseDoc,
        student,
        contacts: merged,
        actorId: user._id,
    });
    caseDoc.updatedBy = user._id;
    await caseDoc.save();
    return { caseDoc, issued };
};

const surveyCountsFor = async ({ schoolId, caseIds }) => {
    if (caseIds.length === 0) return new Map();
    const rows = await SupportSurvey.aggregate([
        { $match: { school: new mongoose.Types.ObjectId(String(schoolId)), case: { $in: caseIds } } },
        {
            $group: {
                _id: '$case',
                total: { $sum: 1 },
                submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
                pending: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', ['sent', 'opened']] },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
    ]);
    return new Map(rows.map((row) => [String(row._id), row]));
};

export const serializeCaseSummary = (caseDoc, counts = null) => ({
    id: String(caseDoc._id),
    student: {
        id: String(caseDoc.student?._id || caseDoc.student),
        name: nameOf(caseDoc.student),
        firstName: caseDoc.student?.firstName || '',
        lastName: caseDoc.student?.lastName || '',
        grade: caseDoc.student?.currentClass?.grade ?? null,
        class: caseDoc.student?.currentClass?.name || caseDoc.class?.name || '',
        section: caseDoc.student?.currentClass?.section || '',
        academicYear: caseDoc.academicYear,
    },
    severity: caseDoc.severity,
    status: caseDoc.status,
    source: caseDoc.source || 'manual',
    subjects: (caseDoc.subjects || []).map((row) => ({
        id: row.subject?._id ? String(row.subject._id) : String(row.subject),
        name: row.name || row.subject?.name || '',
    })),
    owner: caseDoc.owner ? {
        id: String(caseDoc.owner._id || caseDoc.owner),
        name: nameOf(caseDoc.owner),
    } : null,
    nextReviewAt: caseDoc.nextReviewAt,
    lastReviewAt: caseDoc.lastReviewAt,
    responses: counts ? { total: counts.total, submitted: counts.submitted, pending: counts.pending } : null,
    openRequests: caseDoc.openRequests || 0,
    updatedAt: caseDoc.updatedAt,
});

/** Shared scoped filter for the list screen and every export built from it. */
export const buildCaseFilter = async ({ schoolId, user, academicYear = null, filters = {} }) => {
    const query = { school: schoolId };
    if (academicYear) query.academicYear = academicYear;
    if (filters.status && ['active', 'closed'].includes(filters.status)) query.status = filters.status;
    else query.status = 'active';
    if (filters.severity && ['watch', 'support', 'intensive'].includes(filters.severity)) {
        query.severity = filters.severity;
    }
    if (filters.overdue === true || filters.overdue === 'true') {
        query.nextReviewAt = { $lt: new Date() };
    }
    if (filters.owner === 'me') query.owner = user._id;
    else if (validId(filters.owner)) query.owner = filters.owner;
    if (validId(filters.classId)) query.class = filters.classId;
    if (validId(filters.subjectId)) query['subjects.subject'] = filters.subjectId;

    const admin = isSupportAdmin(user);
    if (!admin) {
        query.$or = [
            { owner: user._id },
            { homeroomTeacher: user._id },
            { counselor: user._id },
            { 'participants.user': user._id },
        ];
    }

    if (filters.search) {
        const pattern = new RegExp(escapeRegex(String(filters.search).slice(0, 60)), 'i');
        const students = await Student.find({
            school: schoolId,
            ...(academicYear ? { academicYear } : {}),
            $or: [{ firstName: pattern }, { lastName: pattern }],
        }).select('_id').limit(200).lean();
        query.student = { $in: students.map((row) => row._id) };
    }
    return { query, admin };
};

export const listCases = async ({ schoolId, user, academicYear = null, filters = {}, page = 1, limit = 20 }) => {
    const settings = await loadSettings(schoolId);
    if (!settings.enabled && !isSupportAdmin(user)) {
        throw supportError(403, 'SUPPORT_DISABLED', 'Student support is not enabled for this school.');
    }
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);

    const { query, admin } = await buildCaseFilter({ schoolId, user, academicYear, filters });

    const [total, rows] = await Promise.all([
        SupportCase.countDocuments(query),
        SupportCase.find(query)
            .populate('student', 'firstName lastName currentClass')
            .populate({ path: 'student', populate: { path: 'currentClass', select: 'name grade section' } })
            .populate('owner', 'firstName lastName')
            .populate('class', 'name grade section')
            .sort({ nextReviewAt: 1, updatedAt: -1 })
            .skip((safePage - 1) * safeLimit)
            .limit(safeLimit)
            .lean(),
    ]);
    const counts = await surveyCountsFor({ schoolId, caseIds: rows.map((row) => row._id) });

    const summaryQuery = { school: schoolId };
    if (academicYear) summaryQuery.academicYear = academicYear;
    const statusCounts = await SupportCase.aggregate([
        { $match: { ...summaryQuery, ...(admin ? {} : { $or: query.$or }) } },
        { $group: { _id: { status: '$status', severity: '$severity' }, count: { $sum: 1 } } },
    ]);

    return {
        cases: rows.map((row) => serializeCaseSummary(row, counts.get(String(row._id)))),
        total,
        page: safePage,
        limit: safeLimit,
        counts: statusCounts.reduce((acc, row) => {
            const key = `${row._id.status}:${row._id.severity}`;
            acc[key] = row.count;
            acc[row._id.status] = (acc[row._id.status] || 0) + row.count;
            return acc;
        }, {}),
    };
};

export const caseSurveyAnswersVisible = ({ survey, viewerContext, user }) => {
    if (survey.audience === 'student') return viewerContext.canSeeStudentRaw;
    if (survey.audience === 'parent') {
        return viewerContext.isAdmin || viewerContext.isOwner || viewerContext.isHomeroom;
    }
    const teacherId = String(survey.respondent?.teacher?._id || survey.respondent?.teacher || '');
    return viewerContext.isAdmin || teacherId === String(user?._id || '');
};

export const caseDetail = async ({ schoolId, caseDoc, context, user }) => {
    const caseId = caseDoc._id;
    const [surveys, reviews, versions, plan, checkIns] = await Promise.all([
        SupportSurvey.find({ school: schoolId, case: caseId })
            .populate('subject', 'name')
            .populate({
                path: 'respondent',
                select: 'kind parentSlot name email codeHint teacher deliveryMethod',
                populate: { path: 'teacher', select: 'firstName lastName email' },
            })
            .populate('review', 'month academicYear dueDate')
            .sort({ createdAt: -1 })
            .lean(),
        SupportReview.find({ school: schoolId, case: caseId }).sort({ createdAt: -1 }).lean(),
        SupportPlanVersion.find({ school: schoolId, case: caseId }).sort({ version: -1 }).lean(),
        planForCase({ schoolId, caseDoc }),
        SupportCheckIn.find({ school: schoolId, case: caseId }).sort({ createdAt: -1 }).limit(300).lean(),
    ]);

    const checkInsForPlan = plan
        ? await SupportCheckIn.find({ school: schoolId, plan: plan._id }).sort({ createdAt: -1 }).limit(300).lean()
        : checkIns;

    return {
        case: {
            ...serializeCaseSummary(caseDoc),
            canManage: context.canManage,
            canSeeStudentRaw: context.canSeeStudentRaw,
            concernNote: context.canManage ? caseDoc.concernNote || '' : '',
            studentVoice: caseDoc.studentVoice,
            studentEvidenceInPlan: caseDoc.studentEvidenceInPlan,
            cadenceDays: caseDoc.cadenceDays,
            openedAt: caseDoc.openedAt,
            closedAt: caseDoc.closedAt,
            closeReason: caseDoc.closeReason || '',
            closeSummary: caseDoc.closeSummary || '',
            homeroom: caseDoc.homeroomTeacher
                ? { id: String(caseDoc.homeroomTeacher._id || caseDoc.homeroomTeacher), name: nameOf(caseDoc.homeroomTeacher) }
                : null,
            counselor: caseDoc.counselor
                ? { id: String(caseDoc.counselor._id || caseDoc.counselor), name: nameOf(caseDoc.counselor) }
                : null,
            participants: (caseDoc.participants || []).map((row) => ({
                id: String(row.user?._id || row.user),
                name: nameOf(row.user),
                role: row.role,
                subject: row.subject ? String(row.subject) : null,
                active: row.active !== false,
            })),
            familyContacts: (caseDoc.familyContacts || []).map((row) => ({
                respondentId: String(row.respondent?._id || row.respondent),
                slot: row.slot,
                name: row.name,
                email: context.canManage ? row.email || '' : '',
                codeHint: row.respondent?.codeHint || '',
                deliveryMethod: row.deliveryMethod,
                active: row.active !== false,
            })),
            notes: (caseDoc.notes || []).map((row) => ({
                text: row.text,
                at: row.at,
            })),
        },
        surveys: surveys.map((survey) => ({
            ...serializeSurveyListRow(survey),
            answers: caseSurveyAnswersVisible({ survey, viewerContext: context, user })
                ? (survey.answers || []).map((answer) => ({
                    questionId: answer.questionId,
                    scaleValue: answer.scaleValue,
                    choiceIndex: answer.choiceIndex,
                    choiceValue: answer.choiceValue,
                    textValue: answer.textValue,
                }))
                : [],
        })),
        reviews: reviews.map(serializeReviewRow),
        plan: plan ? serializePlanVersion(plan, { family: false }) : null,
        planVersions: versions.map((row) => ({
            id: String(row._id),
            version: row.version,
            status: row.status,
            createdBy: row.generatedBy?.kind || '',
            createdAt: row.createdAt,
            publishedAt: row.publishedAt,
        })),
        checkIns: checkInsForPlan,
        subjects: (caseDoc.subjects || []).map((row) => ({
            id: String(row.subject?._id || row.subject),
            name: row.name,
        })),
    };
};

export const planForCase = async ({ schoolId, caseDoc }) => {
    if (caseDoc.currentPlan) {
        const current = await SupportPlan.findById(caseDoc.currentPlan);
        if (current) return current;
    }
    return SupportPlan.findOne({ school: schoolId, student: caseDoc.student?._id || caseDoc.student })
        .sort({ updatedAt: -1 });
};

export const serializeSurveyListRow = (survey) => ({
    id: String(survey._id),
    audience: survey.audience,
    subject: survey.subject ? { id: String(survey.subject._id), name: survey.subject.name } : null,
    respondentId: String(survey.respondent?._id || survey.respondent),
    respondentKind: survey.respondent?.kind || '',
    respondentName: survey.respondent?.kind === 'internal_teacher'
        ? nameOf(survey.respondent?.teacher) || survey.respondent?.teacher?.email || ''
        : survey.respondent?.name || '',
    respondentSlot: survey.respondentSlot || survey.respondent?.parentSlot || '',
    status: survey.status,
    round: survey.round,
    dueDate: survey.dueDate,
    sentAt: survey.sentAt,
    submittedAt: survey.submittedAt,
    noConcerns: survey.noConcerns === true,
    deliveryMethod: survey.deliveryMethod,
    deliveryState: survey.deliveryState,
    review: survey.review && survey.review.month
        ? { id: String(survey.review._id), month: survey.review.month, academicYear: survey.review.academicYear }
        : null,
    questionCount: (survey.questions || []).length,
    answeredCount: (survey.answers || []).filter((answer) => (
        answer.scaleValue != null
        || Number.isInteger(answer.choiceIndex)
        || String(answer.choiceValue || '').trim() !== ''
        || String(answer.textValue || '').trim() !== ''
    )).length,
});

export const serializeReviewRow = (review) => ({
    id: String(review._id),
    month: review.month,
    academicYear: review.academicYear,
    sequence: review.sequence,
    status: review.status,
    dueDate: review.dueDate,
    issuedAt: review.issuedAt,
    completedAt: review.completedAt,
});

/** Family-safe version: subject attribution only, never the staff member's name. */
export const serializePlanVersion = (version, { family = false } = {}) => {
    if (!version) return null;
    return {
        id: String(version._id),
        version: version.version,
        revision: version.revision || 1,
        status: version.status,
        headline: version.headline || '',
        headlineAr: version.headlineAr || '',
        summary: version.summary || '',
        summaryAr: version.summaryAr || '',
        strengthKeys: version.strengthKeys || [],
        focusKeys: version.focusKeys || [],
        studentEvidenceIncluded: version.studentEvidenceIncluded === true,
        goals: (version.goals || []).map((goal) => ({
            id: goal.id,
            concern: goal.concern,
            domain: goal.domain,
            subject: goal.subject ? String(goal.subject) : null,
            subjectName: goal.subjectName || '',
            sourceRole: family ? undefined : goal.sourceRole || '',
            title: goal.title,
            titleAr: goal.titleAr,
            description: goal.description,
            descriptionAr: goal.descriptionAr,
            successLook: goal.successLook,
            successLookAr: goal.successLookAr,
            baseline: family ? undefined : goal.baseline || '',
            targetDate: goal.targetDate || null,
            responsibleRole: goal.responsibleRole || '',
            outcome: family ? undefined : goal.outcome || '',
            homeTasks: (goal.homeTasks || []).map((task) => ({
                id: task.id,
                title: task.title,
                titleAr: task.titleAr,
                note: task.note,
                noteAr: task.noteAr,
                dueDate: task.dueDate || null,
                assignedTo: family ? undefined : (task.assignedTo ? String(task.assignedTo) : null),
            })),
            classTasks: (goal.classTasks || []).map((task) => ({
                id: task.id,
                title: task.title,
                titleAr: task.titleAr,
                note: task.note,
                noteAr: task.noteAr,
                dueDate: task.dueDate || null,
                assignedTo: family ? undefined : (task.assignedTo ? String(task.assignedTo) : null),
            })),
        })),
        publishedAt: version.publishedAt,
        approvedAt: version.approvedAt,
        createdAt: version.createdAt,
    };
};

/* ------------------------------ parent requests ---------------------------- */

export const createParentRequest = async ({ schoolId, parentUser, student, message }) => {
    const existing = await SupportCase.findOne({
        school: schoolId,
        student: student._id,
        'parentRequest.status': 'pending',
    });
    if (existing) {
        throw supportError(409, 'REQUEST_EXISTS', 'A support request for this child is already waiting for the school.');
    }
    const caseDoc = new SupportCase({
        school: schoolId,
        student: student._id,
        academicYear: student.academicYear,
        class: student.currentClass?._id || student.currentClass || null,
        homeroomTeacher: null,
        owner: null,
        source: 'parent_request',
        status: 'active',
        severity: 'watch',
        participants: [],
        familyContacts: [],
        parentRequest: {
            parentUser: parentUser._id,
            parentEmail: String(parentUser.email || '').toLowerCase(),
            message: String(message || '').trim().slice(0, 1000),
            status: 'pending',
            at: new Date(),
        },
        createdBy: parentUser._id,
        updatedBy: parentUser._id,
        openRequests: 1,
    });
    await saveNewCase(caseDoc);
    return caseDoc;
};

export const listParentRequests = async ({ schoolId, user, academicYear = null }) => {
    const query = {
        school: schoolId,
        source: 'parent_request',
        'parentRequest.status': 'pending',
    };
    if (academicYear) query.academicYear = academicYear;
    if (!isSupportAdmin(user)) {
        const profiles = await teacherProfileIds(schoolId, user._id);
        const classDocs = profiles.length
            ? await Class.find({
                school: schoolId,
                classTeacher: { $in: profiles.map((row) => row._id) },
            }).select('_id').lean()
            : [];
        query.class = { $in: classDocs.map((row) => row._id) };
    }
    const rows = await SupportCase.find(query)
        .populate('student', 'firstName lastName currentClass')
        .populate({ path: 'student', populate: { path: 'currentClass', select: 'name grade section' } })
        .sort({ createdAt: 1 })
        .limit(100)
        .lean();
    return rows.map((row) => ({
        id: String(row._id),
        student: {
            ...serializeCaseSummary(row).student,
            classId: row.class ? String(row.class._id || row.class) : null,
        },
        message: row.parentRequest?.message || '',
        createdAt: row.createdAt,
    }));
};

export const respondToParentRequest = async ({ schoolId, user, caseDoc, status, response, subjectIds = [] }) => {
    if (!['accepted', 'declined'].includes(status)) {
        throw supportError(400, 'REQUEST_STATUS', 'Choose accept or decline.');
    }
    if (caseDoc.source !== 'parent_request' || caseDoc.parentRequest?.status !== 'pending') {
        throw supportError(409, 'REQUEST_NOT_PENDING', 'This request is no longer waiting for a decision.');
    }
    if (isSupportAdmin(user)) {
        caseDoc.parentRequest.status = status;
        caseDoc.parentRequest.response = String(response || '').trim().slice(0, 600);
        caseDoc.parentRequest.respondedAt = new Date();
        caseDoc.parentRequest.respondedBy = user._id;
        caseDoc.updatedBy = user._id;
        if (status === 'declined') {
            caseDoc.status = 'closed';
            caseDoc.closedAt = new Date();
            caseDoc.closedBy = user._id;
            caseDoc.closeReason = 'other';
            caseDoc.closeSummary = 'Parent request reviewed and declined.';
        }
        caseDoc.openRequests = 0;
        await caseDoc.save();
        return caseDoc;
    }

    const student = await Student.findById(caseDoc.student).populate('currentClass', 'name grade section');
    if (!student) throw supportError(404, 'STUDENT_NOT_FOUND', 'That student was not found.');
    const parsed = await studentForNomination({
        schoolId,
        academicYear: caseDoc.academicYear,
        studentId: student._id,
        user,
        subjectIds,
    });
    const settings = await loadSettings(schoolId);
    const participants = await resolveParticipants({
        scope: parsed.scope,
        subjectIds: parsed.subjectIds,
        actorId: user._id,
    });
    caseDoc.class = parsed.scope.classId;
    caseDoc.homeroomTeacher = parsed.scope.homeroomUserId;
    caseDoc.owner = parsed.scope.homeroomUserId || String(user._id);
    caseDoc.severity = 'watch';
    caseDoc.cadenceDays = reviewCadenceFor(settings, 'watch');
    caseDoc.nextReviewAt = new Date(Date.now() + caseDoc.cadenceDays * 24 * 60 * 60 * 1000);
    caseDoc.subjects = parsed.subjectIds.map((subjectId) => {
        const row = parsed.scope.subjects.find((entry) => entry.subjectId === subjectId);
        return { subject: subjectId, name: row?.name || '', teachers: [row?.teacherUserId].filter(Boolean) };
    });
    caseDoc.participants = participants;
    caseDoc.parentRequest.status = 'accepted';
    caseDoc.parentRequest.response = String(response || '').trim().slice(0, 600);
    caseDoc.parentRequest.respondedAt = new Date();
    caseDoc.parentRequest.respondedBy = user._id;
    caseDoc.openRequests = 0;
    caseDoc.updatedBy = user._id;
    const issued = await ensureFamilyContacts({
        schoolId,
        caseDoc,
        student,
        actorId: user._id,
    });
    await caseDoc.save();
    return { caseDoc, issued };
};
