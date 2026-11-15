import { asyncHandler } from '../middleware/errorHandler.js';
import {
    findPronunciationByPublicId,
    generateForSchool,
    getAiAudioSettings,
    getAiCoverage,
    normalizeStoredAudio,
    regeneratePronunciation,
    removePronunciation
} from '../services/spellingPronunciationService.js';
import {
    getAudioCoverage,
    getAudioSettings,
    importWordAudio,
    removeSchoolWordAudioExample,
    replaceSchoolWordAudioExample,
    searchSchoolWordAudio,
    setAudioSetting
} from '../services/wordAudioService.js';
import {
    flagPronunciation,
    getReviewIndex,
    getReviewQueue,
    markPronunciationReviewed
} from '../services/spellingPronunciationReviewService.js';

// A user can hold several roles. Admins and principals see every grade; only a
// pure teacher is limited to the grades they teach.
const reviewRoleFor = (user) => {
    const roles = [user?.role, ...(user?.roles || [])];
    if (roles.includes('admin') || roles.includes('department_principal')) return 'admin';
    if (roles.includes('teacher')) return 'teacher';
    return user?.role || '';
};

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
        week: req.body?.week,
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

export const removeAiPronunciation = asyncHandler(async (req, res) => {
    const data = await removePronunciation({
        schoolId: req.schoolId,
        userId: req.user?._id,
        word: req.body?.word,
        accent: req.body?.accent
    });
    return res.json({ success: true, data });
});

export const regenerateAiPronunciation = asyncHandler(async (req, res) => {
    const data = await regeneratePronunciation({
        schoolId: req.schoolId,
        userId: req.user?._id,
        word: req.body?.word,
        accent: req.body?.accent
    });
    if (data.available === false) {
        return res.status(409).json({
            success: false,
            message: 'AI word audio is turned off for this platform, so a new clip cannot be generated.',
            code: 'SPELLING_AI_AUDIO_OFF'
        });
    }
    return res.json({ success: true, data });
});

// The review queue for one grade and week: every word with both accents, and
// whether its clip has been reviewed. Teachers only get the grades they teach.
export const pronunciationReviewQueue = asyncHandler(async (req, res) => {
    const grade = String(req.query?.grade || '').trim();
    const week = String(req.query?.week || '').trim();
    const role = reviewRoleFor(req.user);
    // Without a grade and week the caller gets the list of weeks it may open.
    if (!grade || !week) {
        const index = await getReviewIndex({ schoolId: req.schoolId, user: req.user, role });
        return res.json({ success: true, data: { ...index, mode: 'index' } });
    }
    const data = await getReviewQueue({
        schoolId: req.schoolId,
        user: req.user,
        role,
        grade,
        week,
        onlyPending: String(req.query?.onlyPending ?? 'false') === 'true'
    });
    return res.json({ success: true, data: { ...data, mode: 'queue' } });
});

export const reviewPronunciation = asyncHandler(async (req, res) => {
    const data = await markPronunciationReviewed({
        schoolId: req.schoolId,
        user: req.user,
        role: reviewRoleFor(req.user),
        word: req.body?.word,
        accent: req.body?.accent
    });
    return res.json({ success: true, data });
});

export const flagPronunciationIssue = asyncHandler(async (req, res) => {
    const data = await flagPronunciation({
        schoolId: req.schoolId,
        user: req.user,
        role: reviewRoleFor(req.user),
        word: req.body?.word,
        accent: req.body?.accent,
        reason: req.body?.reason
    });
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
