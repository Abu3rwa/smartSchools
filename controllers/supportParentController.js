import { asyncHandler } from '../middleware/errorHandler.js';
import {
    parentCheckIn,
    parentFamilyPlan,
    parentNoConcerns,
    parentPlanHistory,
    parentRequestSupport,
    parentSkipSurvey,
    parentSubmitSurvey,
    parentSupportOverview,
    parentSurveyAnswers,
} from '../services/supportParentService.js';

export const overview = asyncHandler(async (req, res) => {
    const data = await parentSupportOverview({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear: req.academicYear,
    });
    res.json({ success: true, data });
});

export const checkIn = asyncHandler(async (req, res) => {
    const checkInDoc = await parentCheckIn({
        schoolId: req.schoolId,
        parentUser: req.user,
        planId: req.params.planId,
        taskId: req.body.taskId,
        status: req.body.status,
        note: req.body.note,
        academicYear: req.academicYear,
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

export const saveSurvey = asyncHandler(async (req, res) => {
    const survey = await parentSurveyAnswers({
        schoolId: req.schoolId,
        parentUser: req.user,
        surveyId: req.params.surveyId,
        answers: req.body.answers,
        expectedRevision: req.body.expectedRevision,
    });
    res.json({
        success: true,
        data: {
            id: String(survey._id),
            status: survey.status,
            revision: survey.revision,
            lastSavedAt: survey.lastSavedAt,
        },
    });
});

export const submitSurvey = asyncHandler(async (req, res) => {
    const survey = await parentSubmitSurvey({
        schoolId: req.schoolId,
        parentUser: req.user,
        surveyId: req.params.surveyId,
        answers: req.body.answers,
        expectedRevision: req.body.expectedRevision,
    });
    res.json({
        success: true,
        data: {
            id: String(survey._id),
            status: survey.status,
            revision: survey.revision,
            submittedAt: survey.submittedAt,
        },
    });
});

export const noConcerns = asyncHandler(async (req, res) => {
    const survey = await parentNoConcerns({
        schoolId: req.schoolId,
        parentUser: req.user,
        surveyId: req.params.surveyId,
    });
    res.json({
        success: true,
        data: { id: String(survey._id), status: survey.status, noConcerns: survey.noConcerns === true },
    });
});

export const skip = asyncHandler(async (req, res) => {
    const survey = await parentSkipSurvey({
        schoolId: req.schoolId,
        parentUser: req.user,
        surveyId: req.params.surveyId,
        reason: req.body?.reason,
    });
    res.json({ success: true, data: { id: String(survey._id), status: survey.status } });
});

export const requestSupport = asyncHandler(async (req, res) => {
    const data = await parentRequestSupport({
        schoolId: req.schoolId,
        parentUser: req.user,
        childId: req.body?.studentId,
        academicYear: req.academicYear,
        message: req.body?.message,
    });
    res.status(201).json({ success: true, data });
});

export const familyPlan = asyncHandler(async (req, res) => {
    const data = await parentFamilyPlan({
        schoolId: req.schoolId,
        parentUser: req.user,
        childId: req.params.studentId,
        academicYear: req.academicYear,
    });
    res.json({ success: true, data });
});

export const history = asyncHandler(async (req, res) => {
    const data = await parentPlanHistory({
        schoolId: req.schoolId,
        parentUser: req.user,
        studentId: req.params.studentId,
        academicYear: req.academicYear,
    });
    res.json({ success: true, data });
});
