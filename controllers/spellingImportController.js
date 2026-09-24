import { asyncHandler } from '../middleware/errorHandler.js';
import {
    commitSpellingImport,
    previewSpellingImport
} from '../services/spellingImportService.js';

const getContext = (req) => ({
    schoolId: req.schoolId,
    userId: req.user?._id,
    fileName: req.file?.originalname || 'spelling-words.csv',
    content: req.file?.buffer?.toString('utf8')
});

export const previewSpellingWords = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'CSV file is required' });
    const result = await previewSpellingImport(getContext(req));
    return res.status(200).json({ success: true, data: result });
});

export const commitSpellingWords = asyncHandler(async (req, res) => {
    if (!req.body?.importId) return res.status(400).json({ success: false, message: 'importId is required' });
    const result = await commitSpellingImport({ schoolId: req.schoolId, importId: req.body.importId });
    return res.status(200).json({ success: true, data: result });
});
