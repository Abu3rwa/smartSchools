import { asyncHandler } from '../middleware/errorHandler.js';
import GmailCleanupAudit from '../models/GmailCleanupAudit.js';
import gmailSentCleanupService from '../services/gmailSentCleanupService.js';
import logger from '../utils/logger.js';

export const getGmailCleanupStatus = asyncHandler(async (req, res) => {
    const status = await gmailSentCleanupService.getStatus(req.user._id.toString());
    res.json({ success: true, data: status });
});

export const previewGmailSentCleanup = asyncHandler(async (req, res) => {
    const preview = await gmailSentCleanupService.preview(req.user._id.toString(), {
        source: req.body?.source,
        period: req.body?.period,
        timeZone: req.body?.timeZone
    });
    res.json({ success: true, data: preview });
});

export const trashGmailSentMessages = asyncHandler(async (req, res) => {
    if (req.body?.confirmation !== 'TRASH') {
        const error = new Error('Type TRASH to confirm moving Gmail messages to Trash.');
        error.statusCode = 400;
        throw error;
    }
    const result = await gmailSentCleanupService.moveToTrash(
        req.user._id.toString(),
        req.body?.previewToken,
        GmailCleanupAudit,
        logger
    );
    res.json({ success: true, data: result });
});
