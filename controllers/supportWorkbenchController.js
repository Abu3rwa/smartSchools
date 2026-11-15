import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import School from '../models/School.js';
import SupportCase from '../models/SupportCase.js';
import SupportPlanVersion from '../models/SupportPlanVersion.js';
import SupportReview from '../models/SupportReview.js';
import SupportSurvey from '../models/SupportSurvey.js';
import User from '../models/User.js';
import {
    addCaseNote,
    addFamilyContact,
    caseDetail,
    caseSurveyAnswersVisible,
    classScope,
    closeCase,
    createCase,
    listCases,
    listParentRequests,
    loadCase,
    respondToParentRequest,
    serializeCaseSummary,
    serializePlanVersion,
    serializeReviewRow,
    serializeSurveyListRow,
    updateCase,
} from '../services/supportCaseService.js';
import {
    approveQuestion,
    createSchoolQuestion,
    listBank,
    retireQuestion,
    reviseQuestion,
} from '../services/supportBankService.js';
import {
    assertSupportEnabled,
    isSupportAdmin,
    loadSettings,
    settingsResponse,
    saveSettings,
} from '../services/supportSettingsService.js';
import {
    assertFamilySelection,
    cancelReview,
    issueReview,
    markSurveyHandedOver,
    prepareReview,
    previewReview,
    refreshReviewStatus,
    retryFailedDeliveries,
    reviewWithSurveys,
} from '../services/supportReviewService.js';
import {
    approvePlanVersion,
    canApproveVersion,
    draftPlanVersion,
    listPlanVersions,
    publishPlanVersion,
    recordTaskCheckIn,
    setGoalOutcome,
    updateDraftVersion,
} from '../services/supportPlanVersionService.js';
import {
    buildPrintedSlipSheet,
    buildCaseReportHtml,
    caseReportCsv,
    collectCaseReport,
} from '../services/supportReportService.js';
import {
    newsletterSummaryForCase,
    recordSupportObservation,
    supportIntegrationStatus,
} from '../services/supportIntegrationService.js';
import { collectEvidence } from '../services/supportEvidenceService.js';
import {
    confirmSuggestion,
    dismissSuggestion,
    listSuggestions,
} from '../services/supportSuggestionService.js';
import { recordAssistedResponse } from '../services/supportSurveyService.js';
import { teacherClassIds } from '../services/supportCycleService.js';
import { supportError } from '../services/supportAccessService.js';
import { sendPrintableHtml, withPrintPageCss } from '../utils/printableHtml.js';

const schoolOf = (req) => req.schoolId;

const schoolNameOf = async (schoolId) => {
    const school = await School.findById(schoolId).select('name').lean().setOptions({ skipTenantFilter: true });
    return school?.name || '';
};

const activeCaseForRequest = async (req) => {
    const settings = await loadSettings(schoolOf(req));
    if (!settings.enabled && !isSupportAdmin(req.user)) {
        throw supportError(403, 'SUPPORT_DISABLED', 'Student support is not enabled for this school.');
    }
    const { caseDoc, context } = await loadCase({
        schoolId: schoolOf(req),
        caseId: req.params.caseId,
        user: req.user,
    });
    return { caseDoc, context, settings };
};

const requireManage = (context) => {
    if (!context.canManage) {
        throw supportError(403, 'CASE_FORBIDDEN', 'Only the case owner, homeroom teacher, assigned counselor or an admin can change this case.');
    }
};

/* -------------------------------- settings -------------------------------- */

export const getSettings = asyncHandler(async (req, res) => {
    await assertSupportEnabled({ schoolId: schoolOf(req), user: req.user });
    res.json({ success: true, data: await settingsResponse(schoolOf(req), req.user) });
});

export const updateSettings = asyncHandler(async (req, res) => {
    await saveSettings({ schoolId: schoolOf(req), user: req.user, patch: req.body || {} });
    res.json({ success: true, data: await settingsResponse(schoolOf(req), req.user) });
});

/* ---------------------------------- bank ---------------------------------- */

export const getBank = asyncHandler(async (req, res) => {
    await assertSupportEnabled({ schoolId: schoolOf(req), user: req.user });
    const admin = isSupportAdmin(req.user);
    const audience = ['teacher', 'parent', 'student'].includes(req.query.audience) ? req.query.audience : null;
    const requestedStatus = ['draft', 'approved', 'retired'].includes(req.query.status) ? req.query.status : null;
    const status = admin ? requestedStatus : 'approved';
    const rows = await listBank({ schoolId: schoolOf(req), audience, status });
    res.json({ success: true, data: { questions: rows, canManage: admin } });
});

export const createQuestion = asyncHandler(async (req, res) => {
    const doc = await createSchoolQuestion({ schoolId: schoolOf(req), user: req.user, payload: req.body || {} });
    res.status(201).json({ success: true, data: doc });
});

export const reviseQuestionEndpoint = asyncHandler(async (req, res) => {
    const doc = await reviseQuestion({
        schoolId: schoolOf(req),
        user: req.user,
        questionId: req.params.questionId,
        payload: req.body || {},
    });
    res.status(201).json({ success: true, data: doc });
});

export const retireQuestionEndpoint = asyncHandler(async (req, res) => {
    const doc = await retireQuestion({
        schoolId: schoolOf(req),
        user: req.user,
        questionId: req.params.questionId,
    });
    res.json({ success: true, data: doc });
});

export const approveQuestionEndpoint = asyncHandler(async (req, res) => {
    const doc = await approveQuestion({
        schoolId: schoolOf(req),
        user: req.user,
        questionId: req.params.questionId,
    });
    res.json({ success: true, data: doc });
});

/* ---------------------------------- cases --------------------------------- */

export const getClassScope = asyncHandler(async (req, res) => {
    await assertSupportEnabled({ schoolId: schoolOf(req), user: req.user });
    const scope = await classScope({
        schoolId: schoolOf(req),
        academicYear: req.academicYear,
        classId: req.params.classId,
        user: req.user,
    });
    if (!isSupportAdmin(req.user) && !scope.isClassTeacher && !scope.teachesSubject) {
        throw supportError(403, 'CLASS_FORBIDDEN', 'You can only nominate students in a class you teach.');
    }
    const ids = [...new Set([
        scope.homeroomUserId,
        ...scope.subjects.map((row) => row.teacherUserId),
    ].filter(Boolean))];
    const users = ids.length
        ? await User.find({ _id: { $in: ids } }).select('firstName lastName email').lean()
        : [];
    const byId = new Map(users.map((row) => [String(row._id), row]));
    const nameOf = (id) => {
        const person = byId.get(String(id));
        return person ? `${person.firstName || ''} ${person.lastName || ''}`.trim() : '';
    };
    res.json({
        success: true,
        data: {
            class: {
                id: String(scope.classDoc._id),
                name: scope.classDoc.name || '',
                grade: scope.classDoc.grade ?? null,
                section: scope.classDoc.section || '',
                academicYear: scope.classDoc.academicYear || req.academicYear,
            },
            homeroom: scope.homeroomUserId
                ? { id: String(scope.homeroomUserId), name: nameOf(scope.homeroomUserId) }
                : null,
            subjects: scope.subjects.map((row) => ({
                id: row.subjectId,
                name: row.name,
                nameAr: row.nameAr,
                teacherId: row.teacherUserId,
                teacherName: nameOf(row.teacherUserId),
            })),
            canNominate: true,
        },
    });
});

export const getCases = asyncHandler(async (req, res) => {
    const data = await listCases({
        schoolId: schoolOf(req),
        user: req.user,
        academicYear: req.academicYear,
        filters: {
            status: req.query.status,
            severity: req.query.severity,
            overdue: req.query.overdue,
            owner: req.query.owner,
            classId: req.query.classId,
            subjectId: req.query.subjectId,
            search: req.query.search,
        },
        page: req.query.page,
        limit: req.query.limit,
    });
    res.json({ success: true, data });
});

export const createCaseEndpoint = asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await createCase({
        schoolId: schoolOf(req),
        user: req.user,
        academicYear: req.academicYear,
        studentId: body.studentId,
        subjectIds: body.subjectIds,
        severity: body.severity,
        concernNote: body.concernNote,
        counselorId: mongoose.isValidObjectId(body.counselorId) ? body.counselorId : null,
        participantUserIds: Array.isArray(body.participantUserIds) ? body.participantUserIds : null,
        familyContacts: Array.isArray(body.familyContacts) ? body.familyContacts : null,
        actorId: req.user._id,
    });
    res.status(201).json({
        success: true,
        data: {
            case: serializeCaseSummary(result.caseDoc),
            issued: result.issued,
        },
    });
});

export const getCase = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    res.json({ success: true, data: await caseDetail({ schoolId: schoolOf(req), caseDoc, context, user: req.user }) });
});

export const updateCaseEndpoint = asyncHandler(async (req, res) => {
    const { caseDoc } = await activeCaseForRequest(req);
    const updated = await updateCase({ schoolId: schoolOf(req), user: req.user, caseDoc, patch: req.body || {} });
    res.json({ success: true, data: serializeCaseSummary(updated) });
});

export const addNote = asyncHandler(async (req, res) => {
    const { caseDoc } = await activeCaseForRequest(req);
    const updated = await addCaseNote({ caseDoc, user: req.user, text: req.body?.text });
    res.status(201).json({
        success: true,
        data: {
            caseId: String(updated._id),
            notes: (updated.notes || []).map((row) => ({ text: row.text, at: row.at })),
        },
    });
});

export const closeCaseEndpoint = asyncHandler(async (req, res) => {
    const { caseDoc } = await activeCaseForRequest(req);
    const updated = await closeCase({
        schoolId: schoolOf(req),
        caseDoc,
        user: req.user,
        reason: req.body?.reason,
        summary: req.body?.summary,
    });
    res.json({ success: true, data: serializeCaseSummary(updated) });
});

export const addContactEndpoint = asyncHandler(async (req, res) => {
    const { caseDoc } = await activeCaseForRequest(req);
    const result = await addFamilyContact({
        schoolId: schoolOf(req),
        caseDoc,
        user: req.user,
        contact: req.body || {},
    });
    res.status(201).json({ success: true, data: { case: serializeCaseSummary(result.caseDoc), issued: result.issued } });
});

export const getEvidence = asyncHandler(async (req, res) => {
    const { caseDoc } = await activeCaseForRequest(req);
    const windowDays = Math.min(Math.max(Number(req.query.windowDays) || 120, 7), 400);
    const evidence = await collectEvidence({ schoolId: schoolOf(req), caseDoc, windowDays });
    const safe = { ...evidence };
    delete safe.roster;
    res.json({ success: true, data: safe });
});

/* ------------------------------- suggestions ------------------------------ */

export const getSuggestions = asyncHandler(async (req, res) => {
    const data = await listSuggestions({
        schoolId: schoolOf(req),
        user: req.user,
        academicYear: req.academicYear,
    });
    res.json({ success: true, data });
});

export const dismissSuggestionEndpoint = asyncHandler(async (req, res) => {
    const data = await dismissSuggestion({
        schoolId: schoolOf(req),
        user: req.user,
        studentId: req.body?.studentId,
        signature: req.body?.signature,
        reason: req.body?.reason,
    });
    res.json({ success: true, data });
});

export const confirmSuggestionEndpoint = asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await confirmSuggestion({
        schoolId: schoolOf(req),
        user: req.user,
        academicYear: req.academicYear,
        studentId: body.studentId,
        subjectIds: body.subjectIds,
        severity: body.severity,
        concernNote: body.concernNote,
    });
    res.status(201).json({
        success: true,
        data: { case: serializeCaseSummary(result.caseDoc), issued: result.issued },
    });
});

/* ----------------------------- parent requests ---------------------------- */

export const getRequests = asyncHandler(async (req, res) => {
    const data = await listParentRequests({
        schoolId: schoolOf(req),
        user: req.user,
        academicYear: req.academicYear,
    });
    res.json({ success: true, data: { requests: data } });
});

/** A pending request has no owner yet, so class teachers answer it, not loadCase. */
const requestCaseForStaff = async (req) => {
    if (!mongoose.isValidObjectId(req.params.caseId)) {
        throw supportError(400, 'CASE_INVALID', 'Choose a request.');
    }
    const caseDoc = await SupportCase.findOne({ _id: req.params.caseId, school: schoolOf(req) });
    if (!caseDoc) throw supportError(404, 'CASE_NOT_FOUND', 'That support request was not found.');
    if (!isSupportAdmin(req.user)) {
        const classes = await teacherClassIds(schoolOf(req), req.user._id);
        if (!classes.some((row) => String(row._id) === String(caseDoc.class))) {
            throw supportError(403, 'CASE_FORBIDDEN', 'Only a teacher of this class can answer the request.');
        }
    }
    return caseDoc;
};

export const respondToRequest = asyncHandler(async (req, res) => {
    const caseDoc = await requestCaseForStaff(req);
    const result = await respondToParentRequest({
        schoolId: schoolOf(req),
        user: req.user,
        caseDoc,
        status: req.body?.status,
        response: req.body?.response,
        subjectIds: Array.isArray(req.body?.subjectIds) ? req.body.subjectIds : [],
    });
    const updated = result.caseDoc || result;
    res.json({ success: true, data: { case: serializeCaseSummary(updated), issued: result.issued || [] } });
});

/* --------------------------------- reviews -------------------------------- */

const loadReviewForCase = async ({ schoolId, caseId, reviewId }) => {
    if (!mongoose.isValidObjectId(reviewId)) throw supportError(400, 'REVIEW_INVALID', 'Choose a review.');
    const review = await SupportReview.findOne({ _id: reviewId, school: schoolId, case: caseId });
    if (!review) throw supportError(404, 'REVIEW_NOT_FOUND', 'That review was not found.');
    return review;
};

export const previewPlanning = asyncHandler(async (req, res) => {
    await assertSupportEnabled({ schoolId: schoolOf(req), user: req.user });
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const planning = assertFamilySelection(req.body || {});
    res.json({ success: true, data: await previewReview({ schoolId: schoolOf(req), caseDoc, planning }) });
});

export const preparePlanning = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const planning = assertFamilySelection(req.body || {});
    const result = await prepareReview({ schoolId: schoolOf(req), caseDoc, user: req.user, planning });
    res.status(201).json({
        success: true,
        data: {
            review: serializeReviewRow(result.review),
            results: result.results,
            warnings: result.warnings,
            questions: result.questions,
        },
    });
});

export const getReview = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    const review = await loadReviewForCase({
        schoolId: schoolOf(req),
        caseId: caseDoc._id,
        reviewId: req.params.reviewId,
    });
    const data = await reviewWithSurveys({ schoolId: schoolOf(req), reviewId: review._id });
    res.json({
        success: true,
        data: {
            review: serializeReviewRow(data.review),
            config: data.review.config || null,
            surveys: data.surveys.map((survey) => ({
                ...serializeSurveyListRow(survey),
                questions: survey.questions || [],
                answers: caseSurveyAnswersVisible({ survey, viewerContext: context, user: req.user })
                    ? survey.answers || []
                    : [],
            })),
        },
    });
});

export const issuePlanning = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const review = await loadReviewForCase({
        schoolId: schoolOf(req),
        caseId: caseDoc._id,
        reviewId: req.params.reviewId,
    });
    const result = await issueReview({ schoolId: schoolOf(req), caseDoc, review, user: req.user });
    res.json({ success: true, data: { review: serializeReviewRow(result.review), results: result.results } });
});

export const retryPlanning = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const review = await loadReviewForCase({
        schoolId: schoolOf(req),
        caseId: caseDoc._id,
        reviewId: req.params.reviewId,
    });
    const result = await retryFailedDeliveries({ schoolId: schoolOf(req), caseDoc, review, user: req.user });
    res.json({ success: true, data: result });
});

export const cancelPlanning = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const review = await loadReviewForCase({
        schoolId: schoolOf(req),
        caseId: caseDoc._id,
        reviewId: req.params.reviewId,
    });
    const updated = await cancelReview({
        schoolId: schoolOf(req),
        review,
        user: req.user,
        reason: req.body?.reason,
    });
    res.json({ success: true, data: serializeReviewRow(updated) });
});

const slipsForReview = async ({ schoolId, review }) => SupportSurvey.find({
    school: schoolId,
    review: review._id,
    deliveryMethod: { $in: ['printed', 'assisted'] },
})
    .populate('respondent')
    .populate('student', 'firstName lastName academicYear')
    .populate('review', 'month academicYear')
    .sort({ createdAt: 1 });

export const printSlips = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const review = await loadReviewForCase({
        schoolId: schoolOf(req),
        caseId: caseDoc._id,
        reviewId: req.params.reviewId,
    });
    const surveys = await slipsForReview({ schoolId: schoolOf(req), review });
    const html = await buildPrintedSlipSheet({
        surveys,
        schoolName: await schoolNameOf(schoolOf(req)),
    });
    sendPrintableHtml(res, withPrintPageCss(html, { margin: '12mm' }), {
        filename: `support-slips-${review.month}-${review.academicYear}.html`,
    });
});

export const markHandedOver = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const survey = await SupportSurvey.findOne({
        _id: req.params.surveyId,
        school: schoolOf(req),
        case: caseDoc._id,
    });
    if (!survey) throw supportError(404, 'SURVEY_NOT_FOUND', 'That survey is not part of this case.');
    const updated = await markSurveyHandedOver({
        schoolId: schoolOf(req),
        surveyId: survey._id,
        user: req.user,
    });
    res.json({ success: true, data: { id: String(updated._id), status: updated.status, deliveryState: updated.deliveryState } });
});

export const assistedResponse = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    if (!mongoose.isValidObjectId(req.params.surveyId)) {
        throw supportError(400, 'SURVEY_INVALID', 'Choose a survey.');
    }
    const survey = await SupportSurvey.findOne({
        _id: req.params.surveyId,
        school: schoolOf(req),
        case: caseDoc._id,
    });
    if (!survey) throw supportError(404, 'SURVEY_NOT_FOUND', 'That survey is not part of this case.');
    const saved = await recordAssistedResponse({
        survey,
        incomingAnswers: req.body?.answers,
        user: req.user,
    });
    await refreshReviewStatus({ schoolId: schoolOf(req), reviewId: survey.review });
    res.json({
        success: true,
        data: {
            id: String(saved._id),
            status: saved.status,
            deliveryState: saved.deliveryState,
            assistedAt: saved.assistedAt,
        },
    });
});

/* ---------------------------------- plans --------------------------------- */

export const getVersions = asyncHandler(async (req, res) => {
    const { caseDoc } = await activeCaseForRequest(req);
    const rows = await listPlanVersions({ schoolId: schoolOf(req), caseId: caseDoc._id });
    const settings = await loadSettings(schoolOf(req));
    res.json({
        success: true,
        data: {
            versions: rows.map((row) => serializePlanVersion(row, { family: false })),
            canApprove: canApproveVersion({ caseDoc, user: req.user, settings }),
            approvalMode: settings.approvalMode,
        },
    });
});

export const draftPlan = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const result = await draftPlanVersion({
        schoolId: schoolOf(req),
        caseDoc,
        user: req.user,
        useAi: req.body?.useAi !== false,
    });
    res.status(201).json({
        success: true,
        data: {
            version: serializePlanVersion(result.version, { family: false }),
            warnings: result.warnings || [],
        },
    });
});

export const updateVersion = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    await loadVersionForCase({
        schoolId: schoolOf(req),
        caseId: caseDoc._id,
        versionId: req.params.versionId,
    });
    const version = await updateDraftVersion({
        schoolId: schoolOf(req),
        versionId: req.params.versionId,
        revision: req.body?.revision,
        patch: req.body?.patch || {},
    });
    res.json({ success: true, data: serializePlanVersion(version, { family: false }) });
});

const loadVersionForCase = async ({ schoolId, caseId, versionId }) => {
    if (!mongoose.isValidObjectId(versionId)) throw supportError(400, 'VERSION_INVALID', 'Choose a plan version.');
    const version = await SupportPlanVersion.findOne({
        _id: versionId,
        school: schoolId,
        case: caseId,
    });
    if (!version) throw supportError(404, 'VERSION_NOT_FOUND', 'That plan version was not found.');
    return version;
};

export const approveVersion = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const version = await loadVersionForCase({
        schoolId: schoolOf(req),
        caseId: caseDoc._id,
        versionId: req.params.versionId,
    });
    const approved = await approvePlanVersion({
        schoolId: schoolOf(req),
        caseDoc,
        versionId: version._id,
        user: req.user,
    });
    res.json({ success: true, data: serializePlanVersion(approved, { family: false }) });
});

export const publishVersion = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const version = await loadVersionForCase({
        schoolId: schoolOf(req),
        caseId: caseDoc._id,
        versionId: req.params.versionId,
    });
    const result = await publishPlanVersion({
        schoolId: schoolOf(req),
        caseDoc,
        versionId: version._id,
        user: req.user,
    });
    res.json({
        success: true,
        data: {
            version: serializePlanVersion(result.version, { family: false }),
            alreadyPublished: result.alreadyPublished === true,
            notified: result.notified || 0,
        },
    });
});

export const goalOutcome = asyncHandler(async (req, res) => {
    const { caseDoc } = await activeCaseForRequest(req);
    const version = await loadVersionForCase({
        schoolId: schoolOf(req),
        caseId: caseDoc._id,
        versionId: req.params.versionId,
    });
    const updated = await setGoalOutcome({
        schoolId: schoolOf(req),
        versionId: version._id,
        goalId: req.params.goalId,
        outcome: req.body?.outcome,
        note: req.body?.note,
        user: req.user,
    });
    res.json({ success: true, data: serializePlanVersion(updated, { family: false }) });
});

export const checkIn = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const checkInDoc = await recordTaskCheckIn({
        schoolId: schoolOf(req),
        caseDoc,
        taskId: req.body?.taskId,
        scope: req.body?.scope === 'home' ? 'home' : 'class',
        status: req.body?.status,
        note: req.body?.note,
        actorKind: isSupportAdmin(req.user) ? 'staff' : 'teacher',
        actorId: req.user._id,
    });
    res.json({
        success: true,
        data: {
            taskId: checkInDoc.taskId,
            scope: checkInDoc.scope,
            status: checkInDoc.status,
            note: checkInDoc.note,
            updatedAt: checkInDoc.updatedAt,
        },
    });
});

/* ------------------------------- integration ------------------------------ */

export const getIntegration = asyncHandler(async (req, res) => {
    await assertSupportEnabled({ schoolId: schoolOf(req), user: req.user });
    res.json({ success: true, data: await supportIntegrationStatus({ schoolId: schoolOf(req) }) });
});

export const newsletterSummary = asyncHandler(async (req, res) => {
    const { caseDoc } = await activeCaseForRequest(req);
    res.json({ success: true, data: await newsletterSummaryForCase({ schoolId: schoolOf(req), caseDoc }) });
});

export const createObservation = asyncHandler(async (req, res) => {
    const { caseDoc, context } = await activeCaseForRequest(req);
    requireManage(context);
    const result = await recordSupportObservation({
        schoolId: schoolOf(req),
        caseDoc,
        user: req.user,
        note: req.body?.note,
        traitId: req.body?.traitId,
    });
    res.status(201).json({ success: true, data: result });
});

/* --------------------------------- reports -------------------------------- */

const reportFilters = (req) => ({
    status: req.query.status,
    severity: req.query.severity,
    overdue: req.query.overdue,
    owner: req.query.owner,
    classId: req.query.classId,
    subjectId: req.query.subjectId,
    search: req.query.search,
});

export const getReport = asyncHandler(async (req, res) => {
    const report = await collectCaseReport({
        schoolId: schoolOf(req),
        user: req.user,
        academicYear: req.academicYear,
        filters: reportFilters(req),
    });
    res.json({ success: true, data: report });
});

export const downloadReportCsv = asyncHandler(async (req, res) => {
    const report = await collectCaseReport({
        schoolId: schoolOf(req),
        user: req.user,
        academicYear: req.academicYear,
        filters: reportFilters(req),
    });
    const csv = caseReportCsv(report);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="support-cases-${Date.now()}.csv"`);
    res.send(csv);
});

export const printReport = asyncHandler(async (req, res) => {
    const [report, schoolName] = await Promise.all([
        collectCaseReport({
            schoolId: schoolOf(req),
            user: req.user,
            academicYear: req.academicYear,
            filters: reportFilters(req),
        }),
        schoolNameOf(schoolOf(req)),
    ]);
    sendPrintableHtml(res, withPrintPageCss(buildCaseReportHtml({ report, schoolName }), { margin: '12mm' }), {
        filename: 'support-cases.html',
    });
});
