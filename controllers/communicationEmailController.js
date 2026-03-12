import { asyncHandler } from '../middleware/errorHandler.js';
import CommunicationEmailLog from '../models/CommunicationEmailLog.js';
import {
    generateCommunicationEmailDraft,
    getComposerConfig,
    getRecipientSuggestions,
    previewRecipients,
    readSuggestionParams,
    resolveAiDraftCapability,
    resolveSenderIdentity
} from '../services/communicationEmailService.js';
import { processCommunicationEmailSend } from '../services/communicationEmailDispatchService.js';

const sanitizeTokenSelection = (body = {}) => ({
    toParents: Array.isArray(body?.toParents) ? body.toParents : [],
    toTeachers: Array.isArray(body?.toTeachers) ? body.toTeachers : [],
    toStudents: Array.isArray(body?.toStudents) ? body.toStudents : []
});

const parseDraftRequest = (body = {}) => ({
    prompt: String(body?.prompt || '').trim(),
    tone: String(body?.tone || 'professional').trim(),
    requestedLanguages: body?.requestedLanguages,
    primaryLanguage: body?.primaryLanguage,
    secondaryLanguage: body?.secondaryLanguage,
    language: body?.language
});

const buildAiDraftDeniedResponse = (aiDraftCapability) => ({
    success: false,
    message: aiDraftCapability.reason === 'plan_locked'
        ? 'AI Email Drafts are not available on the current subscription plan'
        : 'AI Email Drafts are disabled by your school administrator',
    code: aiDraftCapability.reason === 'plan_locked' ? 'FEATURE_LOCKED' : 'FEATURE_DISABLED',
    data: {
        aiDraft: aiDraftCapability
    }
});

const requestCommunicationEmailDraft = ({
    req,
    draftRequest,
    selection,
    senderDisplayName
}) => generateCommunicationEmailDraft({
    schoolId: req.schoolId,
    userId: req.user._id,
    prompt: draftRequest.prompt,
    tone: draftRequest.tone,
    requestedLanguages: draftRequest.requestedLanguages,
    primaryLanguage: draftRequest.primaryLanguage,
    secondaryLanguage: draftRequest.secondaryLanguage,
    language: draftRequest.language,
    selection,
    senderDisplayName
});

export const getCommunicationComposerConfigController = asyncHandler(async (req, res) => {
    const config = await getComposerConfig(req);
    if (!config.canUseComposer) {
        return res.status(403).json({
            success: false,
            message: 'You do not have communication scope to use the email composer'
        });
    }

    return res.status(200).json({
        success: true,
        data: config
    });
});

export const getCommunicationRecipientSuggestionsController = asyncHandler(async (req, res) => {
    const { field, query, page, limit } = readSuggestionParams(req);
    const data = await getRecipientSuggestions(req, { field, query, page, limit });
    return res.status(200).json({
        success: true,
        data
    });
});

export const previewCommunicationEmailRecipientsController = asyncHandler(async (req, res) => {
    const selection = sanitizeTokenSelection(req.body);
    const preview = await previewRecipients(req, selection);
    const blockedTokenCount = preview.blockedTokens?.length || 0;
    const hasBlocked = blockedTokenCount > 0;

    return res.status(200).json({
        success: true,
        data: {
            ...preview,
            hasBlocked,
            blockedTokenCount
        }
    });
});

export const generateCommunicationEmailDraftController = asyncHandler(async (req, res) => {
    const draftRequest = parseDraftRequest(req.body);

    if (!draftRequest.prompt) {
        return res.status(400).json({
            success: false,
            message: 'Prompt is required'
        });
    }

    const aiDraftCapability = await resolveAiDraftCapability({
        schoolId: req.schoolId
    });
    if (!aiDraftCapability.canUse) {
        return res.status(403).json(buildAiDraftDeniedResponse(aiDraftCapability));
    }

    const selection = sanitizeTokenSelection(req.body);
    const senderIdentity = await resolveSenderIdentity({
        senderUserId: req.user._id,
        fallbackUser: req.user
    });

    const draft = await requestCommunicationEmailDraft({
        req,
        draftRequest,
        selection,
        senderDisplayName: senderIdentity.senderDisplayName
    });

    return res.status(200).json({
        success: true,
        data: draft
    });
});

export const sendCommunicationEmailController = asyncHandler(async (req, res) => {
    const result = await processCommunicationEmailSend({
        req,
        body: req.body
    });
    return res.status(result.statusCode).json(result.body);
});

export const getCommunicationEmailHistoryController = asyncHandler(async (req, res) => {
    const page = Number.parseInt(req.query.page, 10) > 0 ? Number.parseInt(req.query.page, 10) : 1;
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);

    const canViewSchoolLogs = req.user.role === 'admin' || req.user.role === 'super_admin';
    const filter = {
        school: req.schoolId,
        ...(canViewSchoolLogs ? {} : { sender: req.user._id })
    };

    const [items, total] = await Promise.all([
        CommunicationEmailLog.find(filter)
            .sort({ sentAt: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('sender senderRole senderEmail fromLabel subject selectedTokens recipientSummary status sentAt scheduledFor clientTimeZone createdAt')
            .populate('sender', 'firstName lastName email role')
            .lean(),
        CommunicationEmailLog.countDocuments(filter)
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);
    return res.status(200).json({
        success: true,
        data: {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        }
    });
});
