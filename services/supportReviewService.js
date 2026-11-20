import mongoose from 'mongoose';
import SupportReview from '../models/SupportReview.js';
import SupportSurvey from '../models/SupportSurvey.js';
import { ensureInternalRespondent, supportError } from './supportAccessService.js';
import {
    ensureFamilyContacts,
    ensureStudentRespondent,
} from './supportCaseService.js';
import { resolveApprovedBank } from './supportBankService.js';
import { SELECTION_ALGORITHM_VERSION, selectQuestions } from './supportSelectionService.js';
import { loadSettings, studentAge, studentSurveyDefault } from './supportSettingsService.js';
import { sendSurveyInvitations } from './supportEmailService.js';
import { academicPeriodFor } from './supportPlanVersionService.js';

const DAY = 24 * 60 * 60 * 1000;

const nameOf = (person) => `${person?.firstName || ''} ${person?.lastName || ''}`.trim();

const validId = (value) => mongoose.isValidObjectId(value);

const studentVoiceFor = ({ caseDoc, settings, student, override = null }) => {
    if (override === true || override === false) return override;
    if (caseDoc.studentVoice === 'on') return true;
    if (caseDoc.studentVoice === 'off') return false;
    return studentSurveyDefault(settings, student);
};

const teacherItems = ({ caseDoc, planning }) => {
    const participants = (caseDoc.participants || []).filter((row) => (
        row.active !== false
        && row.user
        && row.role === 'teacher'
        && (row.subject || row.subjectId)
    ));
    const requested = Array.isArray(planning?.teachers) ? planning.teachers : null;
    const rows = [];

    if (requested) {
        for (const entry of requested) {
            const userId = String(entry?.userId || entry?.user || '');
            const subjectId = String(entry?.subjectId || entry?.subject || '');
            const match = participants.find((row) => (
                String(row.user?._id || row.user) === userId
                && String(row.subject || '') === subjectId
            ));
            if (!match) {
                throw supportError(400, 'REVIEW_PARTICIPANT', 'One selected teacher is not part of this case for that subject.');
            }
            rows.push({ userId, subjectId, user: match.user });
        }
    } else {
        for (const row of participants) {
            rows.push({
                userId: String(row.user?._id || row.user),
                subjectId: String(row.subject || ''),
                user: row.user,
            });
        }
    }

    const seen = new Set();
    return rows.filter((row) => {
        const key = `${row.userId}:${row.subjectId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const parentItems = ({ caseDoc, planning }) => {
    const contacts = (caseDoc.familyContacts || []).filter((row) => row.active !== false && row.respondent);
    const requested = Array.isArray(planning?.parentSlots) ? new Set(planning.parentSlots) : null;
    return contacts
        .filter((row) => !requested || requested.has(row.slot))
        .map((row) => ({
            slot: row.slot,
            respondentId: String(row.respondent?._id || row.respondent),
            name: row.respondent?.name || row.name || '',
            email: row.respondent?.email || row.email || '',
            deliveryMethod: row.respondent?.deliveryMethod || row.deliveryMethod || 'email',
        }));
};

const overrideFor = ({ planning, key, audience }) => {
    const map = planning?.questions || {};
    const direct = map[key];
    if (Array.isArray(direct)) return direct;
    const broad = map[audience];
    return Array.isArray(broad) ? broad : null;
};

const selectionInputs = ({ plan }) => {
    const goalConcerns = (plan?.goals || []).map((goal) => goal.concern).filter(Boolean);
    return { goalConcerns, difficultyConcerns: [] };
};

const buildItems = async ({ schoolId, caseDoc, settings, planning, period, surveys, banks, plan }) => {
    const student = caseDoc.student;
    const { goalConcerns, difficultyConcerns } = selectionInputs({ caseDoc, plan });
    const items = [];

    for (const teacher of teacherItems({ caseDoc, planning })) {
        const key = `teacher:${teacher.subjectId}`;
        const subject = (caseDoc.subjects || []).find((row) => String(row.subject?._id || row.subject) === teacher.subjectId);
        const selected = await selectQuestions({
            schoolId,
            caseDoc,
            audience: 'teacher',
            subjectId: teacher.subjectId,
            reviewPeriod: period,
            surveys,
            settings,
            length: planning?.length || null,
            bank: banks.teacher,
            goalConcerns,
            difficultyConcerns,
            overrides: overrideFor({ planning, key, audience: 'teacher' }),
        });
        items.push({
            key,
            audience: 'teacher',
            userId: teacher.userId,
            userName: nameOf(teacher.user),
            subjectId: teacher.subjectId,
            subjectName: subject?.name || '',
            deliveryMethod: 'email',
            selection: selected,
        });
    }

    for (const parent of parentItems({ caseDoc, planning })) {
        const key = `parent:${parent.slot}`;
        const selected = await selectQuestions({
            schoolId,
            caseDoc,
            audience: 'parent',
            reviewPeriod: period,
            surveys,
            settings,
            length: planning?.length || null,
            bank: banks.parent,
            goalConcerns,
            difficultyConcerns,
            overrides: overrideFor({ planning, key, audience: 'parent' }),
        });
        items.push({
            key,
            audience: 'parent',
            respondentId: parent.respondentId,
            slot: parent.slot,
            userName: parent.name,
            email: parent.email,
            deliveryMethod: parent.deliveryMethod,
            selection: selected,
        });
    }

    const includeStudent = studentVoiceFor({
        caseDoc,
        settings,
        student,
        override: planning?.includeStudent,
    });
    if (includeStudent) {
        const selected = await selectQuestions({
            schoolId,
            caseDoc,
            audience: 'student',
            reviewPeriod: period,
            surveys,
            settings,
            length: planning?.length || null,
            bank: banks.student,
            goalConcerns,
            difficultyConcerns,
            overrides: overrideFor({ planning, key: 'student', audience: 'student' }),
        });
        items.push({
            key: 'student',
            audience: 'student',
            deliveryMethod: 'portal',
            selection: selected,
        });
    }

    return items;
};

const serializeItem = (item) => ({
    key: item.key,
    audience: item.audience,
    userName: item.userName || '',
    email: item.email || '',
    slot: item.slot || '',
    subject: item.subjectId ? { id: item.subjectId, name: item.subjectName || '' } : null,
    deliveryMethod: item.deliveryMethod,
    mode: item.selection?.mode || '',
    questions: item.selection?.questions || [],
    refs: item.selection?.refs || [],
    anchorCount: item.selection?.anchorCount || 0,
    comparable: item.selection?.comparable !== false,
    scores: item.selection?.scores || [],
});

const loadCaseSurveys = async ({ schoolId, caseId }) => SupportSurvey.find({
    school: schoolId,
    case: caseId,
})
    .populate('subject', 'name')
    // Recency scoring reads the period off review/cycle; without these the
    // weight treats every survey as if it were answered this month.
    .populate('review', 'month academicYear')
    .populate('cycle', 'month academicYear')
    .lean();

const loadBanks = async ({ schoolId }) => {
    const [teacher, parent, student] = await Promise.all([
        resolveApprovedBank({ schoolId, audience: 'teacher' }),
        resolveApprovedBank({ schoolId, audience: 'parent' }),
        resolveApprovedBank({ schoolId, audience: 'student' }),
    ]);
    return { teacher, parent, student };
};

export const previewReview = async ({ schoolId, caseDoc, planning = null }) => {
    const settings = await loadSettings(schoolId);
    if (!settings.enabled) {
        throw supportError(403, 'SUPPORT_DISABLED', 'Student support is not enabled for this school.');
    }
    const period = academicPeriodFor(caseDoc.academicYear);
    const surveys = await loadCaseSurveys({ schoolId, caseId: caseDoc._id });
    const banks = await loadBanks({ schoolId });
    const items = await buildItems({
        schoolId,
        caseDoc,
        settings,
        planning,
        period,
        surveys,
        banks,
        plan: await currentPlanDoc({ schoolId, caseDoc }),
    });

    return {
        period,
        sequence: await nextSequence({ schoolId, caseDoc, period }),
        algorithm: SELECTION_ALGORITHM_VERSION,
        dueDate: dueDateFor({ planning, period, settings }),
        studentVoice: studentVoiceFor({ caseDoc, settings, student: caseDoc.student }),
        studentAge: studentAge(caseDoc.student),
        items: items.map(serializeItem),
        warnings: warningsFor({ items, caseDoc, settings }),
    };
};

const dueDateFor = ({ planning, settings }) => {
    if (planning?.dueDate) {
        const parsed = new Date(planning.dueDate);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const reminderDays = Number(settings.reminderDays) || 3;
    return new Date(Date.now() + Math.max(reminderDays, 1) * DAY);
};

const warningsFor = ({ items, caseDoc, settings }) => {
    const warnings = [];
    if (!items.some((row) => row.audience === 'teacher')) {
        warnings.push({ code: 'NO_TEACHER', message: 'No subject teacher is part of this case, so no teacher survey will be sent.' });
    }
    if (!items.some((row) => row.audience === 'parent')) {
        warnings.push({ code: 'NO_PARENT', message: 'No family contact is selected, so no family survey will be sent.' });
    }
    const printed = items.filter((row) => row.deliveryMethod === 'printed');
    if (printed.length) {
        warnings.push({
            code: 'PRINTED_SLIPS',
            message: `${printed.length} family survey(s) will be printed because no email is on file.`,
        });
    }
    const studentItem = items.some((row) => row.audience === 'student');
    if (!studentItem && caseDoc.studentVoice === 'inherit' && !studentSurveyDefault(settings, caseDoc.student)) {
        warnings.push({ code: 'NO_STUDENT_VOICE', message: 'Student voice is off for this age in school settings.' });
    }
    return warnings;
};

const currentPlanDoc = async ({ schoolId, caseDoc }) => {
    if (!caseDoc.currentPlan) return null;
    const SupportPlan = mongoose.model('SupportPlan');
    return SupportPlan.findOne({ _id: caseDoc.currentPlan, school: schoolId }).lean();
};

const nextSequence = async ({ schoolId, caseDoc }) => {
    const last = await SupportReview.findOne({
        school: schoolId,
        case: caseDoc._id,
    }).sort({ sequence: -1 }).select('sequence').lean();
    if (last?.sequence) return last.sequence + 1;
    const submitted = await SupportSurvey.countDocuments({
        school: schoolId,
        case: caseDoc._id,
        status: 'submitted',
    });
    return submitted > 0 ? 2 : 1;
};

const surveyForItem = async ({ schoolId, caseDoc, review, item, user }) => {
    const round = review.sequence || 1;
    let respondentId = null;
    let deliveryMethod = item.deliveryMethod || 'email';

    if (item.audience === 'teacher') {
        const { respondent } = await ensureInternalRespondent({
            schoolId,
            teacherUserId: item.userId,
            actorId: user?._id || null,
        });
        respondentId = respondent._id;
        deliveryMethod = 'email';
    } else if (item.audience === 'parent') {
        respondentId = validId(item.respondentId) ? item.respondentId : null;
        if (!respondentId) {
            throw supportError(409, 'REVIEW_CONTACT_MISSING', 'A selected family contact has no survey record. Reload the case.');
        }
    } else {
        const respondent = await ensureStudentRespondent({
            schoolId,
            student: caseDoc.student,
            actorId: user?._id || null,
        });
        respondentId = respondent._id;
        deliveryMethod = 'portal';
    }

    const payload = {
        school: schoolId,
        case: caseDoc._id,
        review: review._id,
        cycle: null,
        student: caseDoc.student?._id || caseDoc.student,
        audience: item.audience,
        subject: item.audience === 'teacher' ? item.subjectId : null,
        respondent: respondentId,
        respondentSlot: item.audience === 'parent' ? item.slot : '',
        round,
        dueDate: review.dueDate,
        questions: item.selection.questions,
        questionRefs: item.selection.refs,
        questionSource: 'library',
        deliveryMethod,
        updatedBy: user?._id || null,
    };

    const existing = await SupportSurvey.findOne({
        school: schoolId,
        review: review._id,
        respondent: respondentId,
        audience: item.audience,
        subject: payload.subject,
    }).select('status answers questions revision');

    if (existing && ['submitted', 'skipped'].includes(existing.status)) {
        return { survey: existing, skipped: true };
    }

    if (existing) {
        const nextIds = (payload.questions || []).map((question) => String(question.id));
        const currentIds = (existing.questions || []).map((question) => String(question.id));
        const sameSelection = nextIds.length === currentIds.length
            && nextIds.every((id, index) => id === currentIds[index]);
        if (!sameSelection) {
            // Replace only affected surveys (Q5): the question set changes,
            // answers to surviving questions are kept, and the revision bump
            // tells any open tab to reload.
            const surviving = new Set(nextIds);
            payload.answers = (existing.answers || [])
                .filter((answer) => surviving.has(String(answer.questionId)));
            payload.revision = (existing.revision || 1) + 1;
        }
        if (existing.status === 'cancelled') {
            // Re-preparing a cancelled review deliberately revives its surveys.
            payload.status = 'draft';
            payload.revision = (existing.revision || 1) + 1;
        }
    }

    const survey = await SupportSurvey.findOneAndUpdate(
        {
            school: schoolId,
            review: review._id,
            respondent: respondentId,
            audience: item.audience,
            subject: payload.subject,
        },
        { $set: payload, $setOnInsert: { createdBy: user?._id || null } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return { survey, skipped: false };
};

/**
 * Create or rebuild a review and its surveys. Nothing is sent until
 * `issueReview` runs, so a failed delivery never blocks the others.
 */
export const prepareReview = async ({ schoolId, caseDoc, user, planning = null }) => {
    const settings = await loadSettings(schoolId);
    if (!settings.enabled) {
        throw supportError(403, 'SUPPORT_DISABLED', 'Student support is not enabled for this school.');
    }
    if (caseDoc.status !== 'active') {
        throw supportError(409, 'CASE_CLOSED', 'This case is closed.');
    }

    const period = planning?.period?.month
        ? {
            month: Number(planning.period.month),
            academicYear: String(planning.period.academicYear || caseDoc.academicYear),
        }
        : academicPeriodFor(caseDoc.academicYear);
    if (!Number.isInteger(period.month) || period.month < 1 || period.month > 12) {
        throw supportError(400, 'REVIEW_PERIOD', 'Choose a valid month.');
    }

    const student = caseDoc.student;
    if (!caseDoc.familyContacts?.length || planning?.refreshContacts) {
        await ensureFamilyContacts({
            schoolId,
            caseDoc,
            student,
            actorId: user?._id || null,
        });
        await caseDoc.save();
    }

    const existing = await SupportReview.findOne({
        school: schoolId,
        case: caseDoc._id,
        academicYear: period.academicYear,
        month: period.month,
    });
    if (existing && ['issued', 'completed'].includes(existing.status)) {
        throw supportError(409, 'REVIEW_ISSUED', 'This month\'s review was already issued. Cancel it before rebuilding.');
    }

    const surveys = await loadCaseSurveys({ schoolId, caseId: caseDoc._id });
    const banks = await loadBanks({ schoolId });
    const plan = await currentPlanDoc({ schoolId, caseDoc });
    const items = await buildItems({
        schoolId,
        caseDoc,
        settings,
        planning,
        period,
        surveys,
        banks,
        plan,
    });
    if (!items.length) {
        throw supportError(400, 'REVIEW_EMPTY', 'Select at least one person to ask this month.');
    }

    const dueDate = dueDateFor({ planning, period, settings });
    const sequence = existing?.sequence || await nextSequence({ schoolId, caseDoc, period });
    const config = {
        algorithm: SELECTION_ALGORITHM_VERSION,
        length: planning?.length || settings.defaultSurveyLength,
        items: items.map((item) => ({
            key: item.key,
            audience: item.audience,
            userId: item.userId || null,
            subjectId: item.subjectId || null,
            slot: item.slot || '',
            respondentId: item.respondentId || null,
            deliveryMethod: item.deliveryMethod,
            refs: item.selection.refs,
            questions: item.selection.questions,
            mode: item.selection.mode,
            scores: item.selection.scores,
        })),
        warnings: warningsFor({ items, caseDoc, settings }),
    };

    const review = existing || new SupportReview({
        school: schoolId,
        case: caseDoc._id,
        student: student?._id || caseDoc.student,
        academicYear: period.academicYear,
        month: period.month,
        sequence,
        createdBy: user?._id || null,
    });
    review.dueDate = dueDate;
    review.evidenceCutoff = new Date();
    review.studentVoice = items.some((row) => row.audience === 'student');
    review.status = 'preparing';
    review.config = config;
    review.preparedBy = user?._id || null;
    review.updatedBy = user?._id || null;
    await review.save();

    const results = [];
    for (const item of items) {
        try {
            const result = await surveyForItem({ schoolId, caseDoc, review, item, user });
            results.push({
                key: item.key,
                surveyId: String(result.survey._id),
                audience: item.audience,
                status: result.survey.status,
                skipped: result.skipped,
            });
        } catch (error) {
            results.push({
                key: item.key,
                audience: item.audience,
                status: 'failed',
                reason: error?.message || 'prepare-failed',
            });
        }
    }

    // Anyone still open on this review who is no longer selected is cancelled
    // here, so issuing can never reach a deselected recipient.
    const keptKeys = new Set(items.map((item) => item.key));
    const openSurveys = await SupportSurvey.find({
        school: schoolId,
        review: review._id,
        status: { $in: ['draft', 'sent', 'opened'] },
    }).select('audience subject respondentSlot');
    for (const survey of openSurveys) {
        const key = survey.audience === 'teacher'
            ? `teacher:${survey.subject ? String(survey.subject) : ''}`
            : survey.audience === 'parent'
                ? `parent:${survey.respondentSlot || ''}`
                : 'student';
        if (keptKeys.has(key)) continue;
        await SupportSurvey.updateOne(
            { _id: survey._id },
            { $set: { status: 'cancelled', updatedBy: user?._id || null }, $inc: { revision: 1 } },
        );
        results.push({
            key,
            surveyId: String(survey._id),
            audience: survey.audience,
            status: 'cancelled',
            reason: 'deselected',
        });
    }

    return { review, results, warnings: config.warnings, questions: items.map(serializeItem) };
};

/* --------------------------------- issuing -------------------------------- */

const deliveryStateFor = (method) => {
    if (method === 'portal') return 'portal';
    if (method === 'printed' || method === 'assisted') return 'handed_over';
    return 'pending';
};

export const issueReview = async ({ schoolId, caseDoc, review, user }) => {
    if (!['preparing', 'issued'].includes(review.status)) {
        throw supportError(409, 'REVIEW_NOT_SENDABLE', 'This review cannot be sent.');
    }

    const surveys = await SupportSurvey.find({
        school: schoolId,
        review: review._id,
    })
        .populate('subject', 'name')
        .populate({
            path: 'respondent',
            select: 'kind parentSlot name email codeHint teacher deliveryMethod',
            populate: { path: 'teacher', select: 'firstName lastName email' },
        });

    const emailSurveys = [];
    const results = [];
    for (const survey of surveys) {
        if (['submitted', 'skipped', 'cancelled'].includes(survey.status)) {
            results.push({ surveyId: String(survey._id), status: 'skipped', reason: survey.status });
            continue;
        }
        if (survey.deliveryMethod === 'email') {
            emailSurveys.push(survey);
            continue;
        }
        survey.status = 'sent';
        survey.sentAt = survey.sentAt || new Date();
        survey.deliveryState = deliveryStateFor(survey.deliveryMethod);
        await survey.save();
        results.push({ surveyId: String(survey._id), status: 'issued', delivery: survey.deliveryMethod });
    }

    if (emailSurveys.length) {
        const senderUserId = caseDoc.homeroomTeacher?._id || caseDoc.owner?._id || user?._id || null;
        const mailResults = await sendSurveyInvitations({
            schoolId,
            cycle: { academicYear: review.academicYear },
            surveys: emailSurveys,
            student: caseDoc.student,
            senderUserId,
            dedupeScope: `review:${review._id}`,
        });
        const byId = new Map(mailResults.map((row) => [row.surveyId, row]));
        for (const survey of emailSurveys) {
            const outcome = byId.get(String(survey._id));
            const delivered = outcome?.status === 'sent'
                || (outcome?.status === 'skipped' && outcome?.reason === 'already-sent');
            survey.status = 'sent';
            survey.deliveryState = delivered ? 'sent' : 'failed';
            await survey.save();
            results.push({
                surveyId: String(survey._id),
                status: outcome?.status || 'failed',
                reason: outcome?.reason || '',
            });
        }
    }

    review.status = 'issued';
    review.issuedAt = review.issuedAt || new Date();
    review.updatedBy = user?._id || null;
    await review.save();

    return { review, results };
};

/** Long-lived printed slips: the code survives until the family hands it back. */
export const listPrintedSlipsForReview = async ({ schoolId, review }) => SupportSurvey.find({
    school: schoolId,
    review: review._id,
    deliveryMethod: { $in: ['printed', 'assisted'] },
})
    .populate({
        path: 'respondent',
        select: 'kind parentSlot name email codeHint',
    })
    .lean();

export const markSurveyHandedOver = async ({ schoolId, surveyId, user }) => {
    if (!validId(surveyId)) throw supportError(400, 'SURVEY_INVALID', 'Choose a survey.');
    const survey = await SupportSurvey.findOne({ _id: surveyId, school: schoolId });
    if (!survey) throw supportError(404, 'SURVEY_NOT_FOUND', 'That survey was not found.');
    if (!['printed', 'assisted'].includes(survey.deliveryMethod)) {
        throw supportError(400, 'SURVEY_NOT_PRINTED', 'This survey is not a printed slip.');
    }
    survey.deliveryState = 'handed_over';
    survey.status = survey.status === 'draft' ? 'sent' : survey.status;
    survey.sentAt = survey.sentAt || new Date();
    survey.updatedBy = user?._id || null;
    await survey.save();
    return survey;
};

export const retryFailedDeliveries = async ({ schoolId, caseDoc, review, user }) => {
    const failed = await SupportSurvey.find({
        school: schoolId,
        review: review._id,
        deliveryMethod: 'email',
        deliveryState: 'failed',
        status: { $nin: ['submitted', 'skipped', 'cancelled'] },
    })
        .populate('subject', 'name')
        .populate({
            path: 'respondent',
            select: 'kind parentSlot name email codeHint teacher deliveryMethod',
            populate: { path: 'teacher', select: 'firstName lastName email' },
        });
    if (!failed.length) return { results: [] };

    const mailResults = await sendSurveyInvitations({
        schoolId,
        cycle: { academicYear: review.academicYear },
        surveys: failed,
        student: caseDoc.student,
        senderUserId: caseDoc.homeroomTeacher?._id || caseDoc.owner?._id || user?._id || null,
        dedupeScope: `review:${review._id}`,
    });
    const results = [];
    for (const survey of failed) {
        const outcome = mailResults.find((row) => row.surveyId === String(survey._id));
        const delivered = outcome?.status === 'sent'
            || (outcome?.status === 'skipped' && outcome?.reason === 'already-sent');
        survey.deliveryState = delivered ? 'sent' : 'failed';
        await survey.save();
        results.push({ surveyId: String(survey._id), status: outcome?.status || 'failed' });
    }
    return { results };
};

export const cancelReview = async ({ schoolId, review, user, reason = '' }) => {
    if (review.status === 'completed') {
        throw supportError(409, 'REVIEW_COMPLETED', 'A completed review cannot be cancelled.');
    }
    review.status = 'cancelled';
    review.config = { ...(review.config || {}), cancelReason: String(reason || '').trim().slice(0, 300) };
    review.updatedBy = user?._id || null;
    await review.save();
    await SupportSurvey.updateMany(
        {
            school: schoolId,
            review: review._id,
            status: { $in: ['draft', 'sent', 'opened'] },
        },
        { $set: { status: 'cancelled', updatedBy: user?._id || null } },
    );
    return review;
};

/** Called after a survey is submitted, skipped, reopened or marked no-concerns. */
export const refreshReviewStatus = async ({ schoolId, reviewId }) => {
    if (!validId(reviewId)) return null;
    const review = await SupportReview.findOne({ _id: reviewId, school: schoolId });
    if (!review) return review;
    const open = await SupportSurvey.countDocuments({
        school: schoolId,
        review: review._id,
        status: { $in: ['draft', 'sent', 'opened'] },
    });
    if (['preparing', 'issued'].includes(review.status) && open === 0) {
        review.status = 'completed';
        review.completedAt = new Date();
        await review.save();
    } else if (review.status === 'completed' && open > 0) {
        // A reopened survey makes a completed review active again.
        review.status = 'issued';
        review.completedAt = null;
        await review.save();
    }
    return review;
};

export const reviewWithSurveys = async ({ schoolId, reviewId }) => {
    if (!validId(reviewId)) throw supportError(400, 'REVIEW_INVALID', 'Choose a review.');
    const review = await SupportReview.findOne({ _id: reviewId, school: schoolId }).lean();
    if (!review) throw supportError(404, 'REVIEW_NOT_FOUND', 'That review was not found.');
    const surveys = await SupportSurvey.find({ school: schoolId, review: review._id })
        .populate('subject', 'name')
        .populate({
            path: 'respondent',
            select: 'kind parentSlot name email codeHint teacher deliveryMethod',
            populate: { path: 'teacher', select: 'firstName lastName email' },
        })
        .sort({ audience: 1, createdAt: 1 })
        .lean();
    return { review, surveys };
};

export const assertFamilySelection = (planning) => {
    if (!planning || typeof planning !== 'object') return null;
    if (planning.parentSlots && !Array.isArray(planning.parentSlots)) {
        throw supportError(400, 'REVIEW_SLOTS', 'Choose which family members answer.');
    }
    if (planning.teachers && !Array.isArray(planning.teachers)) {
        throw supportError(400, 'REVIEW_TEACHERS', 'Choose which teachers answer.');
    }
    return planning;
};
