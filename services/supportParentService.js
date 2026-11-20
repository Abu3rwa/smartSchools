import mongoose from 'mongoose';
import SupportCheckIn from '../models/SupportCheckIn.js';
import SupportCycle from '../models/SupportCycle.js';
import SupportPlan from '../models/SupportPlan.js';
import SupportPlanVersion from '../models/SupportPlanVersion.js';
import SupportRespondent from '../models/SupportRespondent.js';
import SupportSurvey from '../models/SupportSurvey.js';
import {
    getParentLinkedStudentById,
    getParentLinkedStudents,
} from './parentDashboardService.js';
import { supportError } from './supportAccessService.js';
import { assertSupportActive, assertSupportEnabled, loadSettings } from './supportSettingsService.js';
import { createParentRequest } from './supportCaseService.js';
import { recordCheckIn } from './supportPlanService.js';
import { refreshReviewStatus } from './supportReviewService.js';
import { serializePlan, serializeSurvey, studentSummary } from './supportSerializers.js';

const linkedChild = async ({ schoolId, parentUser, childId, academicYear }) => (
    getParentLinkedStudentById({ schoolId, parentUser, academicYear, childId })
);

/**
 * A household may hold several parent respondents with separate surveys.
 * Portal authorization must bind to THIS parent's respondent — matching by
 * linked user first, then by the account email — never by picking the first
 * household row, or one parent could read and write the other's answers.
 */
export const matchParentRespondent = (respondents, parentUser) => {
    const userId = String(parentUser?._id || '');
    const email = String(parentUser?.email || '').trim().toLowerCase();
    return respondents.find((row) => row.parentUser && String(row.parentUser) === userId)
        || respondents.find((row) => email && String(row.email || '').trim().toLowerCase() === email)
        || null;
};

const parentRespondentFor = async ({ schoolId, parentUser, studentId }) => {
    const candidates = await SupportRespondent.find({
        school: schoolId,
        kind: 'parent',
        student: studentId,
        active: { $ne: false },
    }).lean();
    return matchParentRespondent(candidates, parentUser);
};

export const parentSupportOverview = async ({ schoolId, parentUser, academicYear }) => {
    const settings = await loadSettings(schoolId);
    if (!settings.enabled) return { enabled: false, children: [] };
    const children = await getParentLinkedStudents({ schoolId, parentUser, academicYear });
    if (children.length === 0) return { enabled: true, children: [] };

    const childIds = children.map((child) => child._id);
    const [plans, respondents, surveys] = await Promise.all([
        SupportPlan.find({
            school: schoolId,
            student: { $in: childIds },
            status: { $in: ['published', 'closed'] },
            staffOnly: { $ne: true },
        }).sort({ publishedAt: -1 })
            .limit(12)
            .lean(),
        SupportRespondent.find({ school: schoolId, kind: 'parent', student: { $in: childIds } })
            .select('student parentUser name email codeHint lastAccessAt')
            .lean(),
        SupportSurvey.find({
            school: schoolId,
            student: { $in: childIds },
            audience: 'parent',
            status: { $in: ['sent', 'opened'] },
        })
            .populate('cycle', 'month academicYear status')
            .sort({ createdAt: -1 })
            .limit(12),
    ]);

    const checkIns = plans.length
        ? await SupportCheckIn.find({
            school: schoolId,
            plan: { $in: plans.map((plan) => plan._id) },
        }).lean()
        : [];

    return {
        enabled: true,
        children: children.map((child) => {
            const childPlans = plans.filter((plan) => String(plan.student) === String(child._id));
            const respondent = matchParentRespondent(
                respondents.filter((row) => String(row.student) === String(child._id)),
                parentUser,
            );
            const respondentId = respondent ? String(respondent._id) : '';
            const survey = surveys.find((row) => (
                String(row.student) === String(child._id)
                && String(row.respondent || '') === respondentId
            ));
            const ownHomeCheckIns = (planId) => checkIns.filter((checkIn) => (
                String(checkIn.plan) === String(planId)
                && (checkIn.scope !== 'home'
                    || !checkIn.actorKey
                    || checkIn.actorKey === `parent:${String(respondent?._id || '')}`)
            ));
            return {
                student: studentSummary(child),
                respondent: respondent
                    ? {
                        codeHint: respondent.codeHint,
                        hasEmail: Boolean(respondent.email),
                        lastAccessAt: respondent.lastAccessAt,
                    }
                    : null,
                plan: childPlans.length
                    ? serializePlan(childPlans[0], ownHomeCheckIns(childPlans[0]._id))
                    : null,
                history: childPlans.slice(1, 4).map((plan) => {
                    const serialized = serializePlan(plan, ownHomeCheckIns(plan._id));
                    return {
                        id: String(plan._id),
                        month: plan.month,
                        academicYear: plan.academicYear,
                        status: plan.status,
                        version: plan.currentVersion || plan.version || 1,
                        homeProgress: serialized.homeProgress,
                        classProgress: serialized.classProgress,
                    };
                }),
                survey: survey ? serializeSurvey(survey, { includeAnswers: true }) : null,
            };
        }),
    };
};

const planForParent = async ({ schoolId, parentUser, planId, academicYear }) => {
    if (!mongoose.isValidObjectId(planId)) {
        throw supportError(400, 'PLAN_INVALID', 'Choose a plan.');
    }
    const plan = await SupportPlan.findOne({ _id: planId, school: schoolId });
    if (!plan) throw supportError(404, 'PLAN_NOT_FOUND', 'That plan was not found.');
    const student = await linkedChild({
        schoolId,
        parentUser,
        childId: plan.student,
        academicYear: academicYear || plan.academicYear,
    });
    if (!student) throw supportError(403, 'PLAN_FORBIDDEN', 'This plan is not linked to your account.');
    return { plan, student };
};

export const parentCheckIn = async ({ schoolId, parentUser, planId, taskId, status, note, academicYear }) => {
    await assertSupportActive({ schoolId });
    const { plan, student } = await planForParent({ schoolId, parentUser, planId, academicYear });
    const respondent = await parentRespondentFor({ schoolId, parentUser, studentId: student._id });
    const checkIn = await recordCheckIn({
        plan,
        cycleId: plan.cycle,
        studentId: plan.student,
        taskId,
        status,
        note,
        scope: 'home',
        actorKind: 'parent',
        actorId: parentUser._id,
        respondentId: respondent?._id || null,
    });
    return checkIn;
};

const surveyForParent = async ({ schoolId, parentUser, surveyId }) => {
    if (!mongoose.isValidObjectId(surveyId)) {
        throw supportError(400, 'SURVEY_INVALID', 'Choose a survey.');
    }
    const survey = await SupportSurvey.findOne({
        _id: surveyId,
        school: schoolId,
        audience: 'parent',
    }).populate('cycle', 'month academicYear status');
    if (!survey) throw supportError(404, 'SURVEY_NOT_FOUND', 'That survey was not found.');
    const student = await linkedChild({
        schoolId,
        parentUser,
        childId: survey.student,
        academicYear: survey.cycle?.academicYear,
    });
    if (!student) throw supportError(403, 'SURVEY_FORBIDDEN', 'This survey is not linked to your account.');
    const respondent = await parentRespondentFor({ schoolId, parentUser, studentId: student._id });
    if (!respondent || String(survey.respondent || '') !== String(respondent._id)) {
        throw supportError(403, 'SURVEY_FORBIDDEN', 'This survey was issued to a different family contact.');
    }
    return survey;
};

export const parentSurveyAnswers = async ({ schoolId, parentUser, surveyId, answers, expectedRevision = null }) => {
    await assertSupportActive({ schoolId });
    const survey = await surveyForParent({ schoolId, parentUser, surveyId });
    const { saveAnswers } = await import('./supportSurveyService.js');
    return saveAnswers({ survey, incomingAnswers: answers, expectedRevision });
};

export const parentSubmitSurvey = async ({ schoolId, parentUser, surveyId, answers, expectedRevision = null }) => {
    await assertSupportActive({ schoolId });
    const survey = await surveyForParent({ schoolId, parentUser, surveyId });
    const { submitAnswers } = await import('./supportSurveyService.js');
    const submitted = await submitAnswers({ survey, incomingAnswers: answers, expectedRevision });
    await refreshReviewStatus({ schoolId, reviewId: survey.review });
    return submitted;
};

export const parentNoConcerns = async ({ schoolId, parentUser, surveyId }) => {
    await assertSupportActive({ schoolId });
    const survey = await surveyForParent({ schoolId, parentUser, surveyId });
    const { markNoConcerns } = await import('./supportSurveyService.js');
    const saved = await markNoConcerns({ survey });
    await refreshReviewStatus({ schoolId, reviewId: survey.review });
    return saved;
};

export const parentSkipSurvey = async ({ schoolId, parentUser, surveyId, reason = '' }) => {
    await assertSupportActive({ schoolId });
    const survey = await surveyForParent({ schoolId, parentUser, surveyId });
    const { skipSurvey } = await import('./supportSurveyService.js');
    const saved = await skipSurvey({ survey, reason });
    await refreshReviewStatus({ schoolId, reviewId: survey.review });
    return saved;
};

export const parentRequestSupport = async ({ schoolId, parentUser, childId, academicYear, message }) => {
    await assertSupportEnabled({ schoolId, user: parentUser });
    const student = await linkedChild({ schoolId, parentUser, childId, academicYear });
    if (!student) throw supportError(403, 'CHILD_FORBIDDEN', 'This child is not linked to your account.');
    const text = String(message || '').trim();
    if (text.length < 10) {
        throw supportError(400, 'REQUEST_TEXT', 'Write a short note about what you would like the school to look at.');
    }
    const caseDoc = await createParentRequest({ schoolId, parentUser, student, message: text });
    return { id: String(caseDoc._id), status: caseDoc.parentRequest?.status || 'pending' };
};

/** The published plan version a family may read, with their own home-task state. */
export const parentFamilyPlan = async ({ schoolId, parentUser, childId, academicYear }) => {
    await assertSupportEnabled({ schoolId, user: parentUser });
    const student = await linkedChild({ schoolId, parentUser, childId, academicYear });
    if (!student) throw supportError(403, 'CHILD_FORBIDDEN', 'This child is not linked to your account.');
    const plan = await SupportPlan.findOne({
        school: schoolId,
        student: student._id,
        status: 'published',
        staffOnly: { $ne: true },
    }).sort({ publishedAt: -1 }).lean();
    if (!plan) return { student: studentSummary(student), plan: null };

    const respondent = await parentRespondentFor({ schoolId, parentUser, studentId: student._id });
    const checkIns = await SupportCheckIn.find({
        school: schoolId,
        plan: plan._id,
        scope: 'home',
    }).lean();
    const own = checkIns.filter((checkIn) => (
        !checkIn.actorKey || checkIn.actorKey === `parent:${String(respondent?._id || '')}`
    ));

    const version = await SupportPlanVersion.findOne({
        school: schoolId,
        plan: plan._id,
        status: 'published',
    }).sort({ version: -1 }).lean();

    return {
        student: studentSummary(student),
        plan: serializePlan(plan, own),
        version: version
            ? {
                id: String(version._id),
                version: version.version,
                headline: version.headline || '',
                headlineAr: version.headlineAr || '',
                summary: version.summary || '',
                summaryAr: version.summaryAr || '',
            }
            : null,
    };
};

export const parentPlanHistory = async ({ schoolId, parentUser, studentId, academicYear }) => {
    const student = await linkedChild({ schoolId, parentUser, childId: studentId, academicYear });
    if (!student) throw supportError(403, 'CHILD_FORBIDDEN', 'This child is not linked to your account.');
    const respondent = await parentRespondentFor({ schoolId, parentUser, studentId: student._id });
    const cycles = await SupportCycle.find({ school: schoolId, student: studentId })
        .sort({ academicYear: -1, createdAt: -1 })
        .limit(12)
        .lean();
    const plans = await SupportPlan.find({
        school: schoolId,
        student: studentId,
        status: { $in: ['published', 'closed'] },
        staffOnly: { $ne: true },
    }).sort({ publishedAt: -1 }).lean();
    const checkIns = plans.length
        ? await SupportCheckIn.find({ school: schoolId, plan: { $in: plans.map((plan) => plan._id) } }).lean()
        : [];
    return {
        student: studentSummary(student),
        cycles: cycles.map((cycle) => ({
            id: String(cycle._id),
            month: cycle.month,
            academicYear: cycle.academicYear,
            status: cycle.status,
        })),
        plans: plans.map((plan) => serializePlan(
            plan,
            checkIns.filter((checkIn) => (
                String(checkIn.plan) === String(plan._id)
                && (checkIn.scope !== 'home'
                    || !checkIn.actorKey
                    || checkIn.actorKey === `parent:${String(respondent?._id || '')}`)
            )),
        )),
    };
};
