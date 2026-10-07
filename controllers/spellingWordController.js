import { asyncHandler } from '../middleware/errorHandler.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingClassSession from '../models/SpellingClassSession.js';

export const listSpellingWords = asyncHandler(async (req, res) => {
    const query = {};
    if (req.query.grade) query.grade = String(req.query.grade).toUpperCase();
    if (req.query.week) query.week = Number(req.query.week);
    if (req.query.category) query.category = String(req.query.category).trim();

    const words = await SpellingWord.find(query)
        .sort({ grade: 1, week: 1, category: 1, order: 1 })
        .limit(Math.min(Math.max(Number(req.query.limit) || 5000, 1), 5000))
        .select('grade week category word order')
        .lean();

    return res.json({
        success: true,
        data: {
            words,
            categories: [...new Set(words.map((word) => word.category))]
        }
    });
});

export const deleteSpellingWord = asyncHandler(async (req, res) => {
    const word = await SpellingWord.findOne({ _id: req.params.wordId, school: req.schoolId }).select('_id').lean();
    if (!word) return res.status(404).json({ success: false, message: 'Spelling word not found' });

    const [activeSession, activeClassSession] = await Promise.all([
        SpellingSession.findOne({
            school: req.schoolId,
            status: 'in-progress',
            'currentItem.wordId': word._id
        }).select('_id').lean(),
        SpellingClassSession.findOne({
            school: req.schoolId,
            status: 'in-progress',
            currentWord: word._id
        }).select('_id').lean()
    ]);
    if (activeSession || activeClassSession) {
        return res.status(409).json({ success: false, message: 'This word is currently being used in an active spelling session' });
    }

    const result = await SpellingWord.deleteOne({ _id: word._id, school: req.schoolId });
    if (result.deletedCount !== 1) return res.status(404).json({ success: false, message: 'Spelling word not found' });
    return res.json({ success: true, data: { id: word._id } });
});
