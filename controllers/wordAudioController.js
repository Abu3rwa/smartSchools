import { asyncHandler } from '../middleware/errorHandler.js';
import {
    getAudioCoverage,
    getAudioSettings,
    importWordAudio,
    setAudioSetting
} from '../services/wordAudioService.js';

export const importWordAudioCsv = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'CSV file is required' });
    const dryRun = String(req.body?.dryRun ?? req.query?.dryRun ?? 'true') !== 'false';
    const data = await importWordAudio({ schoolId: req.schoolId, content: req.file.buffer.toString('utf8'), dryRun });
    return res.status(200).json({ success: true, data });
});

export const wordAudioCoverage = asyncHandler(async (req, res) => {
    const data = await getAudioCoverage({ schoolId: req.schoolId });
    return res.json({ success: true, data });
});

export const listWordAudioSettings = asyncHandler(async (req, res) => {
    const data = await getAudioSettings({ schoolId: req.schoolId });
    return res.json({ success: true, data });
});

export const updateWordAudioSetting = asyncHandler(async (req, res) => {
    const data = await setAudioSetting({
        schoolId: req.schoolId,
        userId: req.user?._id,
        grade: String(req.params.grade || '').toUpperCase(),
        enabled: req.body?.enabled
    });
    return res.json({ success: true, data });
});
