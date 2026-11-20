import SupportSurvey from '../models/SupportSurvey.js';
import {
    adaptiveQuestions,
    roundOneQuestions,
    toSurveyQuestion,
} from './supportLibrary.js';
import {
    analyzeSurveys,
    missingRequiredQuestions,
    normalizeAnswer,
    pickFocusConcerns,
} from './supportPlanBuilder.js';
import { supportError } from './supportAccessService.js';

export const questionsForRound = ({ audience, round = 1, previousSurveys = [] }) => {
    if (round <= 1 || previousSurveys.length === 0) {
        return roundOneQuestions(audience).map((item) => toSurveyQuestion(item));
    }
    const analysis = analyzeSurveys(previousSurveys);
    const concerns = pickFocusConcerns(analysis.scores, 4);
    return adaptiveQuestions(audience, concerns).map((item) => toSurveyQuestion(item));
};

export const createSurvey = async ({
    schoolId,
    cycleId,
    studentId,
    audience,
    subjectId = null,
    respondentId,
    round = 1,
    previousSurveys = [],
    dueDate = null,
    actorId = null,
}) => {
    const questions = questionsForRound({ audience, round, previousSurveys });
    const source = round > 1 && previousSurveys.length > 0 ? 'library' : 'fixed';
    return SupportSurvey.create({
        school: schoolId,
        cycle: cycleId,
        student: studentId,
        audience,
        subject: audience === 'teacher' ? subjectId : null,
        respondent: respondentId,
        round,
        dueDate,
        status: 'sent',
        questionSource: source,
        questions,
        createdBy: actorId,
        updatedBy: actorId,
    });
};

export const findSurveyForRespondent = async ({ schoolId, respondentId, surveyId }) => {
    const survey = await SupportSurvey.findOne({
        _id: surveyId,
        school: schoolId,
        respondent: respondentId,
    })
        .populate('cycle', 'month academicYear status')
        .populate('subject', 'name')
        .populate('student', 'firstName lastName gender academicYear currentClass')
        .populate({ path: 'student', populate: { path: 'currentClass', select: 'name grade section' } });
    if (!survey) throw supportError(404, 'SURVEY_NOT_FOUND', 'This survey could not be found.');
    return survey;
};

/*
 * One allowed-transition policy for every survey mutation, staff or public.
 * submitted is terminal; cancelled surveys only come back through a deliberate
 * re-prepare of their review (revive); skipped surveys reopen (Q7).
 */
export const SURVEY_TRANSITIONS = {
    draft: ['sent', 'opened', 'submitted', 'skipped', 'cancelled'],
    sent: ['opened', 'submitted', 'skipped', 'cancelled'],
    opened: ['submitted', 'skipped', 'cancelled'],
    submitted: [],
    skipped: ['opened', 'cancelled'],
    cancelled: ['draft'],
};

export const surveyTransitionAllowed = (from, to) => (SURVEY_TRANSITIONS[from] || []).includes(to);

const assertTransition = (survey, to, message) => {
    if (!surveyTransitionAllowed(survey.status, to)) {
        throw supportError(409, 'SURVEY_CLOSED', message);
    }
};

export const respondentSurveys = async ({ schoolId, respondentId, limit = 24 }) => SupportSurvey.find({
    school: schoolId,
    respondent: respondentId,
})
    .populate('cycle', 'month academicYear status')
    .populate('subject', 'name')
    .populate('student', 'firstName lastName gender academicYear currentClass')
    .populate({ path: 'student', populate: { path: 'currentClass', select: 'name grade section' } })
    .sort({ createdAt: -1 })
    .limit(limit);

const assertRevision = (survey, expectedRevision) => {
    if (expectedRevision == null) return;
    if (Number(expectedRevision) !== Number(survey.revision || 1)) {
        throw supportError(409, 'SURVEY_STALE', 'This survey was changed in another tab. Reload before saving.', {
            revision: survey.revision || 1,
        });
    }
};

/*
 * Answering stays inside draft/sent/opened. A skipped survey must go through
 * the explicit reopen first (Q7), and a cancelled one only comes back via the
 * review being re-prepared.
 */
const assertCanAnswer = (survey) => {
    if (['draft', 'sent', 'opened'].includes(survey.status)) return;
    if (survey.status === 'skipped') {
        throw supportError(409, 'SURVEY_SKIPPED', 'Reopen this survey before answering it. Your saved answers are kept.');
    }
    if (survey.status === 'submitted') {
        throw supportError(409, 'SURVEY_SUBMITTED', 'This survey was already submitted.');
    }
    throw supportError(409, 'SURVEY_CLOSED', 'This survey was cancelled. Ask the school to re-prepare the review.');
};

export const saveAnswers = async ({ survey, incomingAnswers = [], expectedRevision = null }) => {
    assertCanAnswer(survey);
    assertRevision(survey, expectedRevision);
    const byId = new Map((survey.questions || []).map((question) => [question.id, question]));
    const existing = new Map((survey.answers || []).map((answer) => [answer.questionId, answer]));

    for (const incoming of Array.isArray(incomingAnswers) ? incomingAnswers : []) {
        const question = byId.get(String(incoming?.questionId || ''));
        if (!question) continue;
        const normalized = normalizeAnswer(incoming, question);
        existing.set(question.id, normalized);
    }

    survey.answers = [...existing.values()];
    survey.lastSavedAt = new Date();
    survey.revision = (survey.revision || 1) + 1;
    if (survey.status === 'sent' || survey.status === 'draft') {
        survey.status = 'opened';
        survey.openedAt = survey.openedAt || new Date();
    }
    await survey.save();
    return survey;
};

export const submitAnswers = async ({ survey, incomingAnswers, expectedRevision = null }) => {
    if (incomingAnswers) {
        await saveAnswers({ survey, incomingAnswers, expectedRevision });
    } else {
        assertCanAnswer(survey);
    }
    const fresh = await SupportSurvey.findById(survey._id);
    assertTransition(fresh, 'submitted', 'This survey can no longer be submitted. Reopen a skipped survey first.');
    const missing = missingRequiredQuestions(fresh);
    if (missing.length > 0) {
        throw supportError(400, 'SURVEY_INCOMPLETE', 'Answer every required question before submitting.');
    }
    fresh.status = 'submitted';
    fresh.submittedAt = new Date();
    fresh.revision = (fresh.revision || 1) + 1;
    await fresh.save();
    return fresh;
};

/** Explicit "nothing to add this month". It is not an empty survey. */
export const markNoConcerns = async ({ survey }) => {
    assertTransition(survey, 'submitted', 'This survey is closed. Reopen a skipped survey before recording "no concerns".');
    survey.noConcerns = true;
    survey.noConcernsAt = new Date();
    survey.status = 'submitted';
    survey.submittedAt = new Date();
    survey.revision = (survey.revision || 1) + 1;
    await survey.save();
    return survey;
};

export const skipSurvey = async ({ survey }) => {
    if (survey.status === 'submitted') {
        throw supportError(409, 'SURVEY_SUBMITTED', 'This survey was already submitted.');
    }
    assertTransition(survey, 'skipped', 'This survey can no longer be skipped.');
    survey.status = 'skipped';
    survey.noConcerns = false;
    survey.updatedBy = survey.updatedBy || null;
    survey.revision = (survey.revision || 1) + 1;
    await survey.save();
    return survey;
};

/**
 * Q7: a respondent can bring back their own skipped survey while the due date
 * still allows it; staff can reopen one at any time. Saved answers survive.
 */
export const reopenSurvey = async ({ survey, actorKind = 'respondent' }) => {
    if (survey.status !== 'skipped') {
        throw supportError(409, 'SURVEY_NOT_SKIPPED', 'Only a skipped survey can be reopened.');
    }
    if (actorKind === 'respondent' && survey.dueDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (new Date(survey.dueDate) < today) {
            throw supportError(403, 'SURVEY_DUE_PASSED', 'The due date has passed. Ask the school to reopen this survey.');
        }
    }
    survey.status = 'opened';
    survey.openedAt = survey.openedAt || new Date();
    survey.revision = (survey.revision || 1) + 1;
    await survey.save();
    return survey;
};

/**
 * A staff member copies a paper answer in on the family's behalf. The record
 * says who wrote it and that it was recorded, so it is never mistaken for the
 * family answering online.
 */
export const recordAssistedResponse = async ({ survey, incomingAnswers = [], user }) => {
    if (!['printed', 'assisted'].includes(survey.deliveryMethod)) {
        throw supportError(400, 'SURVEY_NOT_ASSISTED', 'This survey is not a paper or assisted survey.');
    }
    if (['submitted', 'skipped', 'cancelled'].includes(survey.status)) {
        throw supportError(409, 'SURVEY_CLOSED', 'This survey is already closed.');
    }
    const byId = new Map((survey.questions || []).map((question) => [question.id, question]));
    const existing = new Map((survey.answers || []).map((answer) => [answer.questionId, answer]));
    for (const incoming of Array.isArray(incomingAnswers) ? incomingAnswers : []) {
        const question = byId.get(String(incoming?.questionId || ''));
        if (!question) continue;
        existing.set(question.id, normalizeAnswer(incoming, question));
    }
    survey.answers = [...existing.values()];
    // Assisted entry follows the same completeness rule as the family's own submit.
    const missing = missingRequiredQuestions(survey);
    if (missing.length > 0) {
        throw supportError(400, 'SURVEY_INCOMPLETE', 'Record an answer for every required question before saving this response.');
    }
    survey.status = 'submitted';
    survey.submittedAt = new Date();
    survey.deliveryState = 'recorded';
    survey.assistedBy = user?._id || null;
    survey.assistedAt = new Date();
    survey.updatedBy = user?._id || null;
    survey.revision = (survey.revision || 1) + 1;
    await survey.save();
    return survey;
};

export const surveyStatusCounts = (surveys = []) => {
    const counts = {
        total: surveys.length,
        submitted: 0,
        teacherTotal: 0,
        teacherSubmitted: 0,
        parentTotal: 0,
        parentSubmitted: 0,
        sent: 0,
    };
    for (const survey of surveys) {
        const isParent = survey.audience === 'parent';
        if (isParent) counts.parentTotal += 1;
        else counts.teacherTotal += 1;
        if (survey.status === 'submitted') {
            counts.submitted += 1;
            if (isParent) counts.parentSubmitted += 1;
            else counts.teacherSubmitted += 1;
        }
        if (survey.status === 'sent' || survey.status === 'opened') counts.sent += 1;
    }
    return counts;
};
