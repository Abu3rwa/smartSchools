import { asyncHandler } from '../middleware/errorHandler.js';
import {
    parentCheckIn,
    parentPlanHistory,
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
    });
    res.json({
        success: true,
        data: {
            id: String(survey._id),
            status: survey.status,
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
    });
    res.json({
        success: true,
        data: {
            id: String(survey._id),
            status: survey.status,
            submittedAt: survey.submittedAt,
        },
    });
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
