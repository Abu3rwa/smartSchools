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

export const saveAnswers = async ({ survey, incomingAnswers = [] }) => {
    if (survey.status === 'submitted') {
        throw supportError(409, 'SURVEY_SUBMITTED', 'This survey was already submitted.');
    }
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
    if (survey.status === 'sent' || survey.status === 'draft') {
        survey.status = 'opened';
        survey.openedAt = survey.openedAt || new Date();
    }
    await survey.save();
    return survey;
};

export const submitAnswers = async ({ survey, incomingAnswers }) => {
    if (incomingAnswers) {
        await saveAnswers({ survey, incomingAnswers });
    }
    const fresh = await SupportSurvey.findById(survey._id);
    const missing = missingRequiredQuestions(fresh);
    if (missing.length > 0) {
        throw supportError(400, 'SURVEY_INCOMPLETE', 'Answer every required question before submitting.');
    }
    fresh.status = 'submitted';
    fresh.submittedAt = new Date();
    await fresh.save();
    return fresh;
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
