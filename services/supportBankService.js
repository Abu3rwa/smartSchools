import mongoose from 'mongoose';
import SupportQuestion from '../models/SupportQuestion.js';
import { platformBankQuestions } from './supportLibrary.js';
import { supportError } from './supportAccessService.js';
import { isSupportAdmin, loadSettings, userRoles } from './supportSettingsService.js';

const PLATFORM = { skipTenantFilter: true };

let seededThisProcess = false;

/** Idempotent seed of the curated platform bank. Never rewrites an existing row. */
export const ensurePlatformBank = async () => {
    if (seededThisProcess) return;
    const rows = platformBankQuestions().map((row) => ({
        ...row,
        school: null,
        version: 1,
        status: 'approved',
        approvedAt: new Date(),
    }));
    try {
        await SupportQuestion.insertMany(rows, { ordered: false });
    } catch (error) {
        // Duplicate refs are the expected result of a second process seeding.
        const duplicate = error?.code === 11000 || error?.writeErrors?.every((row) => row?.code === 11000);
        if (!duplicate) throw error;
    }
    seededThisProcess = true;
};

const isSuperAdmin = (user) => userRoles(user).includes('super_admin');

const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);

const bilingual = (prompt, promptAr) => {
    const en = cleanText(prompt, 500);
    const ar = cleanText(promptAr, 500);
    if (!en || !ar) {
        throw supportError(400, 'QUESTION_BILINGUAL', 'Write the question in both English and Arabic.');
    }
    return { prompt: en, promptAr: ar };
};

const validatePayload = (payload = {}) => {
    const audience = ['teacher', 'parent', 'student'].includes(payload.audience)
        ? payload.audience
        : null;
    if (!audience) throw supportError(400, 'QUESTION_AUDIENCE', 'Choose who answers this question.');

    const kind = ['scale', 'choice', 'text'].includes(payload.kind) ? payload.kind : null;
    if (!kind) throw supportError(400, 'QUESTION_KIND', 'Choose how this question is answered.');

    const { prompt, promptAr } = bilingual(payload.prompt, payload.promptAr);
    const concern = cleanText(payload.concern, 30).toLowerCase() || 'general';
    const domain = ['academic', 'character', 'general'].includes(payload.domain)
        ? payload.domain
        : 'general';

    const options = Array.isArray(payload.options) ? payload.options.map((row) => cleanText(row, 160)) : [];
    const optionsAr = Array.isArray(payload.optionsAr) ? payload.optionsAr.map((row) => cleanText(row, 160)) : [];
    const anchors = Array.isArray(payload.anchors) ? payload.anchors.map((row) => cleanText(row, 80)) : [];
    const anchorsAr = Array.isArray(payload.anchorsAr) ? payload.anchorsAr.map((row) => cleanText(row, 80)) : [];

    if (kind === 'choice') {
        if (options.length < 2 || options.length > 8 || options.some((row) => !row)) {
            throw supportError(400, 'QUESTION_OPTIONS', 'A choice question needs two to eight options in English.');
        }
        if (optionsAr.length !== options.length || optionsAr.some((row) => !row)) {
            throw supportError(400, 'QUESTION_OPTIONS_AR', 'Every choice needs an Arabic label too.');
        }
    }
    if (kind === 'scale') {
        const max = Number(payload.scaleMax);
        if (!Number.isInteger(max) || max < 2 || max > 5) {
            throw supportError(400, 'QUESTION_SCALE', 'A scale question runs from 2 to 5 points.');
        }
        if (anchors.length && (anchorsAr.length !== anchors.length || anchorsAr.some((row) => !row))) {
            throw supportError(400, 'QUESTION_ANCHORS_AR', 'Every scale label needs an Arabic version too.');
        }
    }

    return {
        audience,
        kind,
        prompt,
        promptAr,
        concern,
        domain,
        scaleMax: kind === 'scale' ? Number(payload.scaleMax) || 4 : 4,
        options: kind === 'choice' ? options : [],
        optionsAr: kind === 'choice' ? optionsAr : [],
        anchors: kind === 'scale' ? anchors : [],
        anchorsAr: kind === 'scale' ? anchorsAr : [],
        required: payload.required !== false,
        allowComment: payload.allowComment === true,
        scored: kind !== 'text' && payload.scored !== false && payload.diagnostic !== true,
        diagnostic: payload.diagnostic === true || kind === 'text',
        trendAnchor: kind !== 'text' && payload.trendAnchor === true,
        followUpFor: Array.isArray(payload.followUpFor)
            ? payload.followUpFor.map((row) => cleanText(row, 30).toLowerCase()).filter(Boolean)
            : [],
        stages: Array.isArray(payload.stages)
            ? payload.stages.filter((stage) => ['kg', 'primary', 'middle', 'high'].includes(stage))
            : [],
    };
};

const baseRef = (payload) => {
    const concern = cleanText(payload.concern, 30).toLowerCase() || 'general';
    return `school_${payload.audience}_${concern}_${Date.now().toString(36)}`.slice(0, 48);
};

export const createSchoolQuestion = async ({ schoolId, user, payload }) => {
    if (!isSupportAdmin(user)) {
        throw supportError(403, 'QUESTION_FORBIDDEN', 'Only a school admin can draft support questions.');
    }
    const settings = await loadSettings(schoolId);
    if (!settings.enabled) {
        throw supportError(403, 'SUPPORT_DISABLED', 'Student support is not enabled for this school.');
    }
    const fields = validatePayload(payload);
    const doc = await SupportQuestion.create({
        ...fields,
        school: schoolId,
        ref: cleanText(payload.ref, 48) || baseRef(fields),
        version: 1,
        status: 'draft',
        createdBy: user?._id || null,
    });
    return doc;
};

export const reviseQuestion = async ({ schoolId, user, questionId, payload }) => {
    if (!isSupportAdmin(user)) {
        throw supportError(403, 'QUESTION_FORBIDDEN', 'Only a school admin can revise support questions.');
    }
    if (!mongoose.isValidObjectId(questionId)) {
        throw supportError(400, 'QUESTION_INVALID', 'Choose a question.');
    }
    const current = await SupportQuestion.findOne({ _id: questionId, school: schoolId });
    if (!current) throw supportError(404, 'QUESTION_NOT_FOUND', 'That school question was not found.');
    const fields = validatePayload({ ...current.toObject(), ...payload, audience: current.audience });
    const latest = await SupportQuestion.findOne({ school: schoolId, ref: current.ref })
        .sort({ version: -1 })
        .select('version')
        .lean();
    const doc = await SupportQuestion.create({
        ...fields,
        school: schoolId,
        ref: current.ref,
        version: (latest?.version || current.version) + 1,
        status: 'draft',
        createdBy: user?._id || null,
    });
    return doc;
};

export const retireQuestion = async ({ schoolId, user, questionId }) => {
    if (!isSupportAdmin(user)) {
        throw supportError(403, 'QUESTION_FORBIDDEN', 'Only a school admin can retire support questions.');
    }
    if (!mongoose.isValidObjectId(questionId)) {
        throw supportError(400, 'QUESTION_INVALID', 'Choose a question.');
    }
    const doc = await SupportQuestion.findOne({ _id: questionId, school: schoolId });
    if (!doc) throw supportError(404, 'QUESTION_NOT_FOUND', 'That school question was not found.');
    doc.status = 'retired';
    doc.retiredAt = new Date();
    await doc.save();
    return doc;
};

/** Platform wording is approved only by a super admin in an explicit school context. */
export const approveQuestion = async ({ schoolId, user, questionId }) => {
    if (!isSuperAdmin(user)) {
        throw supportError(403, 'QUESTION_APPROVAL_FORBIDDEN', 'Only a platform super admin can approve question wording.');
    }
    if (!mongoose.isValidObjectId(questionId)) {
        throw supportError(400, 'QUESTION_INVALID', 'Choose a question.');
    }
    const doc = await SupportQuestion.findOne({ _id: questionId, school: schoolId });
    if (!doc) {
        throw supportError(404, 'QUESTION_NOT_FOUND', 'Approve a school question from its own school context.');
    }
    if (doc.status === 'retired') {
        throw supportError(409, 'QUESTION_RETIRED', 'That question is retired. Create a new version instead.');
    }
    doc.status = 'approved';
    doc.approvedBy = user?._id || null;
    doc.approvedAt = new Date();
    await doc.save();
    return doc;
};

export const listBank = async ({ schoolId, audience = null, status = null }) => {
    await ensurePlatformBank();
    const query = { $or: [{ school: null }, { school: schoolId }] };
    if (audience) query.audience = audience;
    if (status) query.status = status;
    const rows = await SupportQuestion.find(query)
        .setOptions(PLATFORM)
        .sort({ audience: 1, concern: 1, ref: 1, version: -1 })
        .lean();

    // The newest version of a ref is the live one; older versions stay for history.
    const latest = new Map();
    for (const row of rows) {
        const key = `${row.school ? 'school' : 'platform'}:${row.audience}:${row.ref}`;
        if (!latest.has(key)) latest.set(key, row);
    }
    return [...latest.values()];
};

/**
 * Approved questions a school may use for one audience. A school-owned ref
 * replaces the platform ref of the same name when it is approved.
 */
export const resolveApprovedBank = async ({ schoolId, audience }) => {
    await ensurePlatformBank();
    const rows = await SupportQuestion.find({
        audience,
        status: 'approved',
        $or: [{ school: null }, { school: schoolId }],
    })
        .setOptions(PLATFORM)
        .sort({ version: 1 })
        .lean();

    const byRef = new Map();
    for (const row of rows) {
        const key = row.ref;
        const current = byRef.get(key);
        if (!current) {
            byRef.set(key, row);
            continue;
        }
        // A school row wins over the platform row; the newest version wins within one owner.
        if (row.school && !current.school) byRef.set(key, row);
        else if (Boolean(row.school) === Boolean(current.school) && row.version > current.version) {
            byRef.set(key, row);
        }
    }
    return [...byRef.values()];
};

export const questionSnapshot = (row, { id = null, reason = '' } = {}) => ({
    question: {
        id: id || row.ref,
        key: row.concern || 'general',
        domain: row.domain || 'general',
        prompt: row.prompt,
        promptAr: row.promptAr,
        kind: row.kind,
        scaleMax: row.scaleMax || 4,
        options: row.options || [],
        optionsAr: row.optionsAr || [],
        anchors: row.anchors || [],
        anchorsAr: row.anchorsAr || [],
        required: row.required !== false,
        allowComment: row.allowComment === true,
        scored: row.scored !== false,
        diagnostic: row.diagnostic === true,
    },
    ref: {
        id: id || row.ref,
        ref: row.ref,
        version: row.version || 1,
        concern: row.concern || '',
        reason,
    },
});
