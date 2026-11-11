import { asyncHandler } from '../middleware/errorHandler.js';
import {
    getOverview,
    listRoster,
    listEntries,
    createEntry,
    getStudentSummary,
    completeFollowUp
} from '../services/behavior/teacherBehaviorService.js';

export const getBehaviorOverview = asyncHandler(async (req, res) => {
    const data = await getOverview({ req });
    res.status(200).json({ success: true, data });
});

export const getBehaviorRoster = asyncHandler(async (req, res) => {
    const data = await listRoster({ req });
    res.status(200).json({ success: true, data });
});

export const getBehaviorEntries = asyncHandler(async (req, res) => {
    const { range, student, severity, limit } = req.query;
    const data = await listEntries({
        req,
        range: range || 'all',
        studentId: student || null,
        severity: severity || null,
        limit: limit || 50
    });
    res.status(200).json({ success: true, data });
});

export const createBehaviorEntry = asyncHandler(async (req, res) => {
    const data = await createEntry({ req, payload: req.body });
    res.status(201).json({ success: true, data });
});

export const getStudentBehaviorSummary = asyncHandler(async (req, res) => {
    const data = await getStudentSummary({ req, studentId: req.params.studentId });
    res.status(200).json({ success: true, data });
});

export const completeBehaviorFollowUp = asyncHandler(async (req, res) => {
    const data = await completeFollowUp({
        req,
        entryId: req.params.id,
        note: req.body?.note
    });
    res.status(200).json({ success: true, data });
});
