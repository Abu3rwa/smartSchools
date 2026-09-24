import { asyncHandler } from '../middleware/errorHandler.js';
import SpellingWord from '../models/SpellingWord.js';

export const listSpellingWords = asyncHandler(async (req, res) => {
    const query = {};
    if (req.query.grade) query.grade = String(req.query.grade).toUpperCase();
    if (req.query.week) query.week = Number(req.query.week);
    if (req.query.category) query.category = String(req.query.category).trim();

    const words = await SpellingWord.find(query)
        .sort({ grade: 1, week: 1, category: 1, order: 1 })
        .limit(Math.min(Math.max(Number(req.query.limit) || 500, 1), 1000))
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
