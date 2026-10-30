import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import SupportPlan from '../models/SupportPlan.js';
import {
    buildAccessHub,
    findRespondentByCode,
    loadRespondent,
    signAccessToken,
    supportError,
} from '../services/supportAccessService.js';
import {
    findSurveyForRespondent,
    saveAnswers,
    submitAnswers,
} from '../services/supportSurveyService.js';
import { recordCheckIn } from '../services/supportPlanService.js';
import { serializeSurvey } from '../services/supportSerializers.js';

const respondentSchool = (req) => req.supportRespondent.school?._id || req.supportRespondent.school;

export const requireSupportAccess = asyncHandler(async (req, res, next) => {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw supportError(401, 'ACCESS_REQUIRED', 'Enter your code to continue.');
    const decoded = (await import('../services/supportAccessService.js')).verifyAccessToken(token);
    if (!decoded) throw supportError(401, 'ACCESS_EXPIRED', 'This access has expired. Enter your code again.');
    req.supportRespondent = await loadRespondent(decoded.supportRespondent);
    next();
});

export const resolveCode = asyncHandler(async (req, res) => {
    const matched = await findRespondentByCode(req.body.code);
    const respondent = await loadRespondent(matched._id);
    const token = signAccessToken(respondent);
    const hub = await buildAccessHub(respondent);
    res.json({ success: true, data: { token, ...hub } });
});

export const hub = asyncHandler(async (req, res) => {
    const data = await buildAccessHub(req.supportRespondent);
    res.json({ success: true, data });
});

const surveyForRequest = async (req) => findSurveyForRespondent({
    schoolId: respondentSchool(req),
    respondentId: req.supportRespondent._id,
    surveyId: req.params.surveyId,
});

export const getSurvey = asyncHandler(async (req, res) => {
    const survey = await surveyForRequest(req);
    if (survey.status === 'sent') {
        survey.status = 'opened';
        survey.openedAt = survey.openedAt || new Date();
        await survey.save();
    }
    res.json({ success: true, data: serializeSurvey(survey) });
});

export const saveSurvey = asyncHandler(async (req, res) => {
    const survey = await surveyForRequest(req);
    const saved = await saveAnswers({ survey, incomingAnswers: req.body.answers });
    res.json({
        success: true,
        data: {
            id: String(saved._id),
            status: saved.status,
            lastSavedAt: saved.lastSavedAt,
        },
    });
});

export const submitSurvey = asyncHandler(async (req, res) => {
    const survey = await surveyForRequest(req);
    const submitted = await submitAnswers({ survey, incomingAnswers: req.body.answers });
    res.json({
        success: true,
        data: {
            id: String(submitted._id),
            status: submitted.status,
            submittedAt: submitted.submittedAt,
        },
    });
});

export const checkIn = asyncHandler(async (req, res) => {
    const respondent = req.supportRespondent;
    if (respondent.kind !== 'parent' || !respondent.student) {
        throw supportError(403, 'CHECKIN_PARENT_ONLY', 'Only the family can check in on home tasks.');
    }
    if (!mongoose.isValidObjectId(req.params.planId)) {
        throw supportError(400, 'PLAN_INVALID', 'Choose a plan.');
    }
    const plan = await SupportPlan.findOne({
        _id: req.params.planId,
        school: respondentSchool(req),
        student: respondent.student._id,
        status: { $in: ['published', 'closed'] },
    });
    if (!plan) throw supportError(404, 'PLAN_NOT_FOUND', 'That plan was not found.');
    const checkInDoc = await recordCheckIn({
        plan,
        cycleId: plan.cycle,
        studentId: plan.student,
        taskId: req.body.taskId,
        status: req.body.status,
        note: req.body.note,
        scope: 'home',
        actorKind: 'parent',
        respondentId: respondent._id,
    });
    res.json({
        success: true,
        data: {
            taskId: checkInDoc.taskId,
            status: checkInDoc.status,
            note: checkInDoc.note,
            updatedAt: checkInDoc.updatedAt,
        },
    });
});
