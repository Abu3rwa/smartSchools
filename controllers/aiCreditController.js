import { asyncHandler } from '../middleware/errorHandler.js';
import * as creditService from '../services/aiCreditService.js';

export const getMyCredit = asyncHandler(async (req, res) => {
    const summary = await creditService.getCreditSummary({
        schoolId: req.schoolId,
        userId: req.user._id
    });
    res.json({ success: true, data: summary });
});

export const getMyCreditHistory = asyncHandler(async (req, res) => {
    const history = await creditService.listCreditHistory({
        schoolId: req.schoolId,
        userId: req.user._id,
        page: req.query.page,
        type: req.query.type
    });
    res.json({ success: true, data: history });
});

export const requestCredit = asyncHandler(async (req, res) => {
    const request = await creditService.createCreditRequest({
        schoolId: req.schoolId,
        userId: req.user._id,
        amountCents: req.body?.amountCents,
        note: req.body?.note,
        target: req.body?.target,
        role: req.user.role
    });
    res.status(201).json({ success: true, data: request });
});

export const cancelCreditRequest = asyncHandler(async (req, res) => {
    const request = await creditService.cancelCreditRequest({
        schoolId: req.schoolId,
        userId: req.user._id,
        requestId: req.params.requestId
    });
    res.json({ success: true, data: request });
});

/* Admin: every teacher in the school */

export const listCreditAccounts = asyncHandler(async (req, res) => {
    const data = await creditService.listCreditAccounts({
        schoolId: req.schoolId,
        adminId: req.user._id
    });
    res.json({ success: true, data });
});

export const getTeacherCreditHistory = asyncHandler(async (req, res) => {
    const history = await creditService.listCreditHistory({
        schoolId: req.schoolId,
        userId: req.params.userId,
        page: req.query.page,
        type: req.query.type
    });
    res.json({ success: true, data: history });
});

export const allocateCredit = asyncHandler(async (req, res) => {
    const result = await creditService.allocateCredit({
        schoolId: req.schoolId,
        userId: req.params.userId,
        amountCents: req.body?.amountCents,
        note: req.body?.note,
        adminId: req.user._id
    });
    res.json({ success: true, data: result });
});

export const reclaimCredit = asyncHandler(async (req, res) => {
    const result = await creditService.reclaimCredit({
        schoolId: req.schoolId,
        userId: req.params.userId,
        amountCents: req.body?.amountCents,
        note: req.body?.note,
        adminId: req.user._id
    });
    res.json({ success: true, data: result });
});

export const updateCreditSettings = asyncHandler(async (req, res) => {
    const account = await creditService.updateCreditSettings({
        schoolId: req.schoolId,
        userId: req.params.userId,
        lowBalanceCents: req.body?.lowBalanceCents,
        paused: req.body?.paused
    });
    res.json({ success: true, data: account });
});

export const decideCreditRequest = asyncHandler(async (req, res) => {
    const result = await creditService.decideCreditRequest({
        schoolId: req.schoolId,
        requestId: req.params.requestId,
        adminId: req.user._id,
        approve: req.body?.approve === true,
        amountCents: req.body?.amountCents,
        note: req.body?.note
    });
    res.json({ success: true, data: result });
});

/* Platform owner: markup and cross-school AI spend */

export const getPlatformCredit = asyncHandler(async (req, res) => {
    const data = await creditService.getPlatformCreditOverview({ page: req.query.page });
    res.json({ success: true, data });
});

export const updatePlatformMarkup = asyncHandler(async (req, res) => {
    const data = await creditService.updatePlatformMarkup({
        markupPercent: req.body?.markupPercent,
        updatedBy: req.user._id
    });
    res.json({ success: true, data });
});

export const listPlatformSchools = asyncHandler(async (_req, res) => {
    const data = await creditService.listPlatformSchools();
    res.json({ success: true, data });
});

export const fundSchool = asyncHandler(async (req, res) => {
    const data = await creditService.fundSchool({
        schoolId: req.params.schoolId,
        amountCents: req.body?.amountCents,
        reservePercent: req.body?.reservePercent,
        note: req.body?.note,
        adminId: req.user._id
    });
    res.status(201).json({ success: true, data });
});

export const grantTeacherCredit = asyncHandler(async (req, res) => {
    const result = await creditService.grantCredit({
        schoolId: req.params.schoolId,
        userId: req.params.userId,
        amountCents: req.body?.amountCents,
        note: req.body?.note,
        adminId: req.user._id
    });
    res.json({ success: true, data: result });
});

export const decidePlatformCreditRequest = asyncHandler(async (req, res) => {
    const result = await creditService.decidePlatformCreditRequest({
        requestId: req.params.requestId,
        adminId: req.user._id,
        approve: req.body?.approve === true,
        amountCents: req.body?.amountCents,
        note: req.body?.note
    });
    res.json({ success: true, data: result });
});
