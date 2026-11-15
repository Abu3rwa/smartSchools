import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import SupportSurvey from '../models/SupportSurvey.js';
import { resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import { supportError } from '../services/supportAccessService.js';
import { assertSupportEnabled } from '../services/supportSettingsService.js';
import { refreshReviewStatus } from '../services/supportReviewService.js';
import {
    markNoConcerns,
    saveAnswers,
    skipSurvey,
    submitAnswers,
} from '../services/supportSurveyService.js';
import { serializeSurvey } from '../services/supportSerializers.js';

const studentForRequest = async (req) => {
    const academicYear = resolveAcademicYearForRequest(req);
    const fields = '_id user currentClass academicYear firstName lastName';
    const student = await Student.findOne({ school: req.schoolId, user: req.user._id, academicYear })
        .select(fields)
        .lean();
    if (student) return student;
    return Student.findOne({ school: req.schoolId, user: req.user._id })
        .select(fields)
        .sort({ createdAt: -1 })
        .lean();
};

const surveyForStudent = async (req) => {
    if (!mongoose.isValidObjectId(req.params.surveyId)) {
        throw supportError(400, 'SURVEY_INVALID', 'Choose a survey.');
    }
    const student = await studentForRequest(req);
    if (!student) throw supportError(403, 'STUDENT_FORBIDDEN', 'No student record is linked to this account.');
    const survey = await SupportSurvey.findOne({
        _id: req.params.surveyId,
        school: req.schoolId,
        student: student._id,
        audience: 'student',
    }).populate('subject', 'name');
    if (!survey) throw supportError(404, 'SURVEY_NOT_FOUND', 'That survey was not found.');
    return { survey, student };
};

export const listSurveys = asyncHandler(async (req, res) => {
    await assertSupportEnabled({ schoolId: req.schoolId, user: req.user });
    const student = await studentForRequest(req);
    if (!student) return res.json({ success: true, data: { surveys: [] } });
    const surveys = await SupportSurvey.find({
        school: req.schoolId,
        student: student._id,
        audience: 'student',
        status: { $in: ['sent', 'opened', 'submitted', 'skipped'] },
    })
        .populate('subject', 'name')
        .sort({ createdAt: -1 })
        .limit(12)
        .lean();
    res.json({
        success: true,
        data: {
            surveys: surveys.map((survey) => ({
                id: String(survey._id),
                subject: survey.subject?.name || '',
                status: survey.status,
                dueDate: survey.dueDate,
                questionCount: (survey.questions || []).length,
                submittedAt: survey.submittedAt,
            })),
        },
    });
});

export const getSurvey = asyncHandler(async (req, res) => {
    const { survey } = await surveyForStudent(req);
    if (survey.status === 'sent') {
        survey.status = 'opened';
        survey.openedAt = survey.openedAt || new Date();
        await survey.save();
    }
    res.json({ success: true, data: serializeSurvey(survey) });
});

export const saveSurvey = asyncHandler(async (req, res) => {
    const { survey } = await surveyForStudent(req);
    const saved = await saveAnswers({
        survey,
        incomingAnswers: req.body.answers,
        expectedRevision: req.body.expectedRevision,
    });
    res.json({
        success: true,
        data: {
            id: String(saved._id),
            status: saved.status,
            revision: saved.revision,
            lastSavedAt: saved.lastSavedAt,
        },
    });
});

export const submitSurvey = asyncHandler(async (req, res) => {
    const { survey } = await surveyForStudent(req);
    const submitted = await submitAnswers({
        survey,
        incomingAnswers: req.body.answers,
        expectedRevision: req.body.expectedRevision,
    });
    await refreshReviewStatus({ schoolId: req.schoolId, reviewId: survey.review });
    res.json({
        success: true,
        data: {
            id: String(submitted._id),
            status: submitted.status,
            revision: submitted.revision,
            submittedAt: submitted.submittedAt,
        },
    });
});

export const noConcerns = asyncHandler(async (req, res) => {
    const { survey } = await surveyForStudent(req);
    const saved = await markNoConcerns({ survey });
    await refreshReviewStatus({ schoolId: req.schoolId, reviewId: survey.review });
    res.json({
        success: true,
        data: { id: String(saved._id), status: saved.status, noConcerns: saved.noConcerns === true },
    });
});

export const skip = asyncHandler(async (req, res) => {
    const { survey } = await surveyForStudent(req);
    const saved = await skipSurvey({ survey, reason: req.body?.reason });
    await refreshReviewStatus({ schoolId: req.schoolId, reviewId: survey.review });
    res.json({ success: true, data: { id: String(saved._id), status: saved.status } });
});
