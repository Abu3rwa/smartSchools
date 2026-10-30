import jwt from 'jsonwebtoken';
import School from '../models/School.js';
import Student from '../models/Student.js';
import SupportCheckIn from '../models/SupportCheckIn.js';
import SupportPlan from '../models/SupportPlan.js';
import SupportRespondent from '../models/SupportRespondent.js';
import SupportSurvey from '../models/SupportSurvey.js';
import {
    CODE_PATTERN,
    codeHint,
    generateCode,
    hashCode,
    isLocked,
    lockStateAfterFailure,
    normalizeCode,
    verifyCode,
} from './supportCodeService.js';
import {
    serializePlan,
    serializeRespondent,
    serializeSurvey,
    studentSummary,
} from './supportSerializers.js';

export const supportError = (status, code, message) => {
    const error = new Error(message);
    error.status = status;
    error.statusCode = status;
    error.code = code;
    return error;
};

const codeIsTaken = async (code) => {
    const existing = await SupportRespondent.exists({ codeHash: hashCode(code) })
        .setOptions({ skipTenantFilter: true });
    return Boolean(existing);
};

export const issueCode = async (respondent, { rotate = false } = {}) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const code = generateCode();
        if (await codeIsTaken(code)) continue;
        respondent.codeHash = hashCode(code);
        respondent.codeHint = codeHint(code);
        respondent.codeIssuedAt = new Date();
        respondent.failedAttempts = 0;
        respondent.lockedUntil = null;
        if (rotate) respondent.lastAccessAt = respondent.lastAccessAt || null;
        await respondent.save();
        return code;
    }
    throw supportError(500, 'CODE_GENERATION_FAILED', 'Could not issue a code. Try again.');
};

const primaryContact = (student) => {
    const info = student?.parentInfo || {};
    const preferred = info.primaryContact || 'father';
    const order = [preferred, 'father', 'mother', 'guardian'].filter(
        (value, index, list) => list.indexOf(value) === index,
    );
    for (const kind of order) {
        const email = String(info[`${kind}Email`] || '').trim().toLowerCase();
        if (email) {
            return { email, name: String(info[`${kind}Name`] || '').trim() };
        }
    }
    return { email: '', name: '' };
};

export const ensureParentRespondent = async ({ schoolId, student, actorId = null }) => {
    const contact = primaryContact(student);
    let respondent = await SupportRespondent.findOne({
        school: schoolId,
        kind: 'parent',
        student: student._id,
    }).select('+codeHash');

    if (!respondent) {
        respondent = new SupportRespondent({
            school: schoolId,
            kind: 'parent',
            student: student._id,
            name: contact.name,
            email: contact.email,
            invitedBy: actorId,
            codeHash: 'pending',
            codeHint: '00',
        });
        const code = await issueCode(respondent);
        return { respondent, code, created: true };
    }

    if (contact.name && !respondent.name) respondent.name = contact.name;
    if (contact.email && contact.email !== respondent.email) respondent.email = contact.email;
    await respondent.save();
    return { respondent, code: null, created: false };
};

export const ensureInternalRespondent = async ({ schoolId, teacherUserId, actorId = null }) => {
    let respondent = await SupportRespondent.findOne({
        school: schoolId,
        kind: 'internal_teacher',
        teacher: teacherUserId,
    }).select('+codeHash');
    if (respondent) return { respondent, code: null, created: false };

    respondent = new SupportRespondent({
        school: schoolId,
        kind: 'internal_teacher',
        teacher: teacherUserId,
        invitedBy: actorId,
        codeHash: 'pending',
        codeHint: '00',
    });
    const code = await issueCode(respondent);
    return { respondent, code, created: true };
};

export const createExternalRespondent = async ({ schoolId, name, email, actorId = null }) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    let respondent = await SupportRespondent.findOne({
        school: schoolId,
        kind: 'external_teacher',
        email: normalizedEmail,
    }).select('+codeHash');
    if (respondent) {
        if (name && name !== respondent.name) {
            respondent.name = String(name).trim();
            await respondent.save();
        }
        return { respondent, code: null, created: false };
    }

    respondent = new SupportRespondent({
        school: schoolId,
        kind: 'external_teacher',
        name: String(name || '').trim(),
        email: normalizedEmail,
        invitedBy: actorId,
        codeHash: 'pending',
        codeHint: '00',
    });
    const code = await issueCode(respondent);
    return { respondent, code, created: true };
};

export const rotateRespondentCode = async (respondent) => {
    const code = await issueCode(respondent, { rotate: true });
    return code;
};

export const signAccessToken = (respondent) => jwt.sign(
    {
        supportRespondent: String(respondent._id),
        schoolId: String(respondent.school),
        kind: respondent.kind,
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' },
);

export const verifyAccessToken = (token) => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded?.supportRespondent) return null;
        return decoded;
    } catch {
        return null;
    }
};

export const findRespondentByCode = async (rawCode) => {
    const code = normalizeCode(rawCode);
    if (!CODE_PATTERN.test(code)) {
        throw supportError(400, 'CODE_FORMAT', 'Enter the six-digit code from your email.');
    }
    const candidates = await SupportRespondent.find({
        codeHint: codeHint(code),
        active: true,
    })
        .select('+codeHash')
        .setOptions({ skipTenantFilter: true })
        .limit(20);

    const match = candidates.find((candidate) => verifyCode(code, candidate.codeHash));
    if (!match) {
        if (candidates.length > 0 && candidates.length <= 3) {
            for (const candidate of candidates) {
                if (isLocked(candidate)) continue;
                Object.assign(candidate, lockStateAfterFailure(candidate.failedAttempts));
                await candidate.save();
            }
        }
        throw supportError(401, 'CODE_INVALID', 'That code did not match. Check the six digits and try again.');
    }
    if (isLocked(match)) {
        throw supportError(429, 'CODE_LOCKED', 'Too many attempts. Try again in a few minutes.');
    }

    match.failedAttempts = 0;
    match.lockedUntil = null;
    match.lastAccessAt = new Date();
    await match.save();
    return match;
};

export const loadRespondent = async (respondentId) => {
    const respondent = await SupportRespondent.findById(respondentId)
        .setOptions({ skipTenantFilter: true })
        .populate('teacher', 'firstName lastName email')
        .populate({
            path: 'student',
            select: 'firstName lastName gender academicYear currentClass',
            populate: { path: 'currentClass', select: 'name grade section' },
        });
    if (!respondent || !respondent.active) {
        throw supportError(401, 'ACCESS_EXPIRED', 'This access is no longer active.');
    }
    return respondent;
};

export const buildAccessHub = async (respondent) => {
    const schoolId = respondent.school?._id || respondent.school;
    const school = await School.findById(schoolId).select('name').lean().setOptions({ skipTenantFilter: true });

    const surveys = await SupportSurvey.find({ school: schoolId, respondent: respondent._id })
        .setOptions({ skipTenantFilter: true })
        .populate('cycle', 'month academicYear status')
        .populate('subject', 'name')
        .populate({
            path: 'respondent',
            select: 'kind name email teacher',
            populate: { path: 'teacher', select: 'firstName lastName email' },
        })
        .populate({
            path: 'student',
            populate: { path: 'currentClass', select: 'name grade section' },
        })
        .sort({ createdAt: -1 })
        .limit(24);

    let plans = [];
    if (respondent.kind === 'parent' && respondent.student) {
        const planDocs = await SupportPlan.find({
            school: schoolId,
            student: respondent.student._id,
            status: { $in: ['published', 'closed'] },
        })
            .setOptions({ skipTenantFilter: true })
            .sort({ publishedAt: -1 })
            .limit(6);
        const checkIns = planDocs.length
            ? await SupportCheckIn.find({
                school: schoolId,
                plan: { $in: planDocs.map((plan) => plan._id) },
            }).setOptions({ skipTenantFilter: true }).lean()
            : [];
        plans = planDocs.map((plan) => ({
            ...serializePlan(
                plan,
                checkIns.filter((checkIn) => String(checkIn.plan) === String(plan._id)),
            ),
            student: studentSummary(respondent.student),
        }));
    }

    return {
        respondent: serializeRespondent(respondent),
        school: { id: String(schoolId), name: school?.name || '' },
        student: studentSummary(respondent.student),
        surveys: surveys.map((survey) => serializeSurvey(survey)),
        plans,
    };
};
