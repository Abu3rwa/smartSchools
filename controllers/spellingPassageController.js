import { asyncHandler } from '../middleware/errorHandler.js';
import {
    approveSpellingPassage,
    cancelSpellingPassageDelivery,
    discardSpellingPassage,
    generateSpellingPassage,
    getSpellingPassage,
    sendSpellingPassage,
    updateSpellingPassage
} from '../services/spellingPassageService.js';

const staffOnly = (req) => ['admin', 'department_principal', 'teacher'].includes(req.user?.role);

export const getPassage = asyncHandler(async (req, res) => {
    const passage = await getSpellingPassage({ schoolId: req.schoolId, sessionId: req.params.id, user: req.user });
    return res.json({ success: true, data: passage });
});

export const generatePassage = asyncHandler(async (req, res) => {
    if (!staffOnly(req)) return res.status(403).json({ success: false, message: 'Staff access required' });
    const passage = await generateSpellingPassage({ schoolId: req.schoolId, sessionId: req.params.id, userId: req.user._id, style: req.body?.style });
    return res.status(201).json({ success: true, data: passage });
});

export const updatePassage = asyncHandler(async (req, res) => {
    if (!staffOnly(req)) return res.status(403).json({ success: false, message: 'Staff access required' });
    const passage = await updateSpellingPassage({ schoolId: req.schoolId, sessionId: req.params.id, userId: req.user._id, content: req.body?.content });
    return res.json({ success: true, data: passage });
});

export const approvePassage = asyncHandler(async (req, res) => {
    if (!staffOnly(req)) return res.status(403).json({ success: false, message: 'Staff access required' });
    const passage = await approveSpellingPassage({ schoolId: req.schoolId, sessionId: req.params.id, userId: req.user._id });
    return res.json({ success: true, data: passage });
});

export const discardPassage = asyncHandler(async (req, res) => {
    if (!staffOnly(req)) return res.status(403).json({ success: false, message: 'Staff access required' });
    const passage = await discardSpellingPassage({ schoolId: req.schoolId, sessionId: req.params.id, userId: req.user._id });
    return res.json({ success: true, data: passage });
});

export const sendPassage = asyncHandler(async (req, res) => {
    if (!staffOnly(req)) return res.status(403).json({ success: false, message: 'Staff access required' });
    const delivery = await sendSpellingPassage({ schoolId: req.schoolId, sessionId: req.params.id, userId: req.user._id });
    return res.status(201).json({ success: true, data: delivery });
});

export const cancelPassageSend = asyncHandler(async (req, res) => {
    if (!staffOnly(req)) return res.status(403).json({ success: false, message: 'Staff access required' });
    const passage = await cancelSpellingPassageDelivery({ schoolId: req.schoolId, sessionId: req.params.id, userId: req.user._id });
    return res.json({ success: true, data: passage });
});
