import { asyncHandler } from '../middleware/errorHandler.js';
import {
    findPronunciationByPublicId,
    generateForSchool,
    getAiAudioSettings,
    getAiCoverage,
    normalizeStoredAudio
} from '../services/spellingPronunciationService.js';
import {
    getAudioCoverage,
    getAudioSettings,
    importWordAudio,
    removeSchoolWordAudioExample,
    replaceSchoolWordPronunciation,
    replaceSchoolWordAudioExample,
    searchSchoolWordAudio,
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

export const searchWordAudio = asyncHandler(async (req, res) => {
    const data = await searchSchoolWordAudio({ schoolId: req.schoolId, query: req.query.q });
    return res.json({ success: true, data });
});

export const replaceWordPronunciation = asyncHandler(async (req, res) => {
    const data = await replaceSchoolWordPronunciation({
        schoolId: req.schoolId,
        word: req.body?.word,
        field: String(req.body?.field || ''),
        currentUrl: req.body?.currentUrl,
        replacementUrl: req.body?.replacementUrl
    });
    return res.json({ success: true, data });
});

export const deleteWordAudioExample = asyncHandler(async (req, res) => {
    const data = await removeSchoolWordAudioExample({
        schoolId: req.schoolId,
        word: req.body?.word,
        dictionary: String(req.body?.dictionary || '').toLowerCase(),
        url: req.body?.url
    });
    return res.json({ success: true, data });
});

export const replaceWordAudioExample = asyncHandler(async (req, res) => {
    const data = await replaceSchoolWordAudioExample({
        schoolId: req.schoolId,
        word: req.body?.word,
        dictionary: String(req.body?.dictionary || '').toLowerCase(),
        url: req.body?.url,
        replacementUrl: req.body?.replacementUrl
    });
    return res.json({ success: true, data });
});

export const aiAudioSettings = asyncHandler(async (_req, res) => {
    const data = await getAiAudioSettings();
    return res.json({ success: true, data });
});

export const updateAiAudioSettings = asyncHandler(async (_req, res) => {
    return res.status(409).json({
        success: false,
        message: 'AI word audio is controlled by the platform. A super admin turns it on or off for every school.',
        code: 'SPELLING_AI_AUDIO_PLATFORM_CONTROLLED'
    });
});

export const aiAudioCoverage = asyncHandler(async (req, res) => {
    const data = await getAiCoverage({ schoolId: req.schoolId });
    return res.json({ success: true, data });
});

export const generateAiWordAudio = asyncHandler(async (req, res) => {
    const requested = Number(req.body?.limit);
    const limit = Number.isFinite(requested) ? Math.min(200, Math.max(1, Math.floor(requested))) : 80;
    const data = await generateForSchool({
        schoolId: req.schoolId,
        userId: req.user?._id,
        grade: req.body?.grade,
        limit
    });
    if (data.available === false) {
        return res.status(409).json({
            success: false,
            message: 'AI word audio is turned off for this platform. Set SPELLING_AI_AUDIO=true to use it.',
            code: 'SPELLING_AI_AUDIO_OFF'
        });
    }
    return res.json({ success: true, data });
});

// Public and immutable: an <audio> element cannot carry the Bearer token. The
// random id is unguessable and the bytes are a single word, never school data.
export const getPronunciationAudio = asyncHandler(async (req, res) => {
    const doc = await findPronunciationByPublicId(req.params.publicId);
    const audio = normalizeStoredAudio(doc?.data);
    if (!audio) {
        return res.status(404).json({ success: false, message: 'Pronunciation audio not found' });
    }
    res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${doc.key}"`,
        'X-Content-Type-Options': 'nosniff',
        // The client is served from another origin than the API, so Helmet's
        // same-origin default silently blocks every clip with media error 4.
        'Cross-Origin-Resource-Policy': 'cross-origin'
    });
    return res.send(audio);
});
