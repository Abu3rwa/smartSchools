import { asyncHandler } from '../middleware/errorHandler.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingSession from '../models/SpellingSession.js';
import WordAudio from '../models/WordAudio.js';
import { buildSpellingWordAudioCsv, buildSpellingWordImportCsv } from '../utils/spellingWordExport.js';
import { normalizeWordKey } from '../utils/wordAudio.js';

export const listSpellingWords = asyncHandler(async (req, res) => {
    const query = {};
    if (req.schoolId) query.school = req.schoolId;
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

export const exportSpellingWordLibrary = asyncHandler(async (req, res) => {
    const words = await SpellingWord.find({ school: req.schoolId })
        .sort({ grade: 1, week: 1, category: 1, order: 1 })
        .select('grade week category word order definition')
        .lean();
    if (words.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'There are no spelling words to export. Import a word list first.'
        });
    }
    const csv = buildSpellingWordImportCsv({ words });

    res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="spelling-word-library.csv"',
        'Cache-Control': 'no-store'
    });
    return res.send(csv);
});

export const exportSpellingWordAudioLibrary = asyncHandler(async (req, res) => {
    const words = await SpellingWord.find({ school: req.schoolId })
        .sort({ grade: 1, week: 1, category: 1, order: 1 })
        .select('grade week category word order definition')
        .lean();
    if (words.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'There are no spelling words to export. Import a word list first.'
        });
    }
    const wordKeys = [...new Set(words.map((word) => normalizeWordKey(word.word)).filter(Boolean))];
    const audioEntries = wordKeys.length
        ? await WordAudio.find({ word: { $in: wordKeys } }).lean()
        : [];
    const csv = buildSpellingWordAudioCsv({ words, audioEntries });

    res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="spelling-word-audio-library.csv"',
        'Cache-Control': 'no-store'
    });
    return res.send(csv);
});

export const deleteSpellingWord = asyncHandler(async (req, res) => {
    const word = await SpellingWord.findOne({ _id: req.params.wordId, school: req.schoolId }).select('_id').lean();
    if (!word) return res.status(404).json({ success: false, message: 'Spelling word not found' });

    const activeSession = await SpellingSession.findOne({
        school: req.schoolId,
        status: 'in-progress',
        'currentItem.wordId': word._id
    }).select('_id').lean();
    if (activeSession) {
        return res.status(409).json({ success: false, message: 'This word is currently being used in an active spelling session' });
    }

    const result = await SpellingWord.deleteOne({ _id: word._id, school: req.schoolId });
    if (result.deletedCount !== 1) return res.status(404).json({ success: false, message: 'Spelling word not found' });
    return res.json({ success: true, data: { id: word._id } });
});
