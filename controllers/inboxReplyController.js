import { asyncHandler } from '../middleware/errorHandler.js';
import InboxAssistantSettings from '../models/InboxAssistantSettings.js';
import { INBOX_REPLY_TYPES } from '../constants/inboxReplyTypes.js';
import inboxDraftService from '../services/inbox/inboxDraftService.js';
import inboxSendService from '../services/inbox/inboxSendService.js';

const MAX_CUSTOM_TYPES = 20;
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const loadCustomTypes = async (user) => {
    const settings = await InboxAssistantSettings.findOne({
        school: user.school,
        user: user._id
    }).lean();
    return settings?.customReplyTypes || [];
};

const parseLabel = (value) => {
    const label = text(value);
    if (!label || label.length > 60) throw badRequest('Give the reply type a name under 60 characters.');
    return label;
};

const parseInstruction = (value) => {
    const instruction = text(value);
    if (!instruction || instruction.length > 300) {
        throw badRequest('Describe what the reply should say in under 300 characters.');
    }
    return instruction;
};

export const listReplyTypes = asyncHandler(async (req, res) => {
    const language = req.query.lang === 'ar' ? 'ar' : 'en';
    const customTypes = await loadCustomTypes(req.user);

    res.json({
        types: INBOX_REPLY_TYPES.map((type) => ({
            id: type.id,
            group: type.group,
            label: language === 'ar' ? type.labelAr : type.labelEn,
            instruction: type.instruction
        })),
        customTypes: customTypes.map((type) => ({
            id: type.id,
            group: 'custom',
            label: type.label,
            instruction: type.instruction
        }))
    });
});

export const estimateDraft = asyncHandler(async (req, res) => {
    res.json(await inboxDraftService.estimateDraft(req.user, req.params.id));
});

export const createDraft = asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (typeof body.replyType !== 'string' || !body.replyType.trim()) {
        throw badRequest('Choose a reply type from the list.');
    }
    if (body.customInstruction !== undefined && typeof body.customInstruction !== 'string') {
        throw badRequest('Write what the reply should say.');
    }
    if (body.note !== undefined && typeof body.note !== 'string') {
        throw badRequest('The note must be text.');
    }
    if (body.language !== undefined && !['en', 'ar'].includes(body.language)) {
        throw badRequest('Choose English or Arabic.');
    }

    const draft = await inboxDraftService.generateDraft(req.user, req.params.id, body);
    res.status(201).json(draft);
});

export const patchDraft = asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (body.subject !== undefined && typeof body.subject !== 'string') {
        throw badRequest('The subject must be text.');
    }
    if (body.body !== undefined && typeof body.body !== 'string') {
        throw badRequest('The reply text must be text.');
    }
    res.json(await inboxDraftService.updateDraft(req.user, req.params.id, body));
});

export const saveGmailDraft = asyncHandler(async (req, res) => {
    res.json(await inboxDraftService.saveToGmailDraft(req.user, req.params.id));
});

export const sendDraft = asyncHandler(async (req, res) => {
    const body = req.body || {};
    res.json(await inboxSendService.sendDraft(req.user, req.params.id, {
        confirm: body.confirm,
        includeCc: body.includeCc
    }));
});

export const discardDraft = asyncHandler(async (req, res) => {
    res.json(await inboxDraftService.discardDraft(req.user, req.params.id));
});

export const listSent = asyncHandler(async (req, res) => {
    res.json(await inboxSendService.listSent(req.user, {
        limit: req.query.limit,
        cursor: req.query.cursor
    }));
});

export const deleteSent = asyncHandler(async (req, res) => {
    res.json(await inboxSendService.deleteSent(req.user, req.params.id));
});

export const clearSent = asyncHandler(async (req, res) => {
    res.json(await inboxSendService.clearSent(req.user, { confirm: req.body?.confirm }));
});

export const addReplyType = asyncHandler(async (req, res) => {
    const label = parseLabel(req.body?.label);
    const instruction = parseInstruction(req.body?.instruction);
    const current = await loadCustomTypes(req.user);
    if (current.length >= MAX_CUSTOM_TYPES) {
        throw badRequest(`Keep at most ${MAX_CUSTOM_TYPES} reply types of your own.`);
    }

    const type = {
        id: `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        label,
        instruction
    };
    const saved = await InboxAssistantSettings.findOneAndUpdate(
        { school: req.user.school, user: req.user._id },
        { $push: { customReplyTypes: type } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    res.status(201).json({ customReplyTypes: saved.customReplyTypes || [] });
});

export const deleteReplyType = asyncHandler(async (req, res) => {
    const saved = await InboxAssistantSettings.findOneAndUpdate(
        { school: req.user.school, user: req.user._id },
        { $pull: { customReplyTypes: { id: String(req.params.id || '') } } },
        { new: true }
    ).lean();
    if (!saved) throw Object.assign(new Error('Reply type not found.'), { statusCode: 404 });
    res.json({ customReplyTypes: saved.customReplyTypes || [] });
});
