import { asyncHandler } from '../middleware/errorHandler.js';
import SpellingWord from '../models/SpellingWord.js';
import WordAudio from '../models/WordAudio.js';
import {
    buildSpellingWordAudioCsv,
    buildSpellingWordImportCsv,
    buildSpellingWordRoundtripCsv
} from '../utils/spellingWordExport.js';
import { normalizeWordKey } from '../utils/wordAudio.js';
import { domainError } from '../utils/spellingLibraryErrors.js';
import {
    addLibraryWord,
    archiveLibraryWord,
    bulkLibraryMutation,
    getLibraryWord,
    listLibraryHistory,
    listLibraryWords,
    moveLibraryWord,
    previewLibraryOperation,
    reorderLibraryWeek,
    updateLibraryWord
} from '../services/spellingLibraryService.js';
import {
    addWordBodySchema,
    bulkBodySchema,
    deleteWordBodySchema,
    impactPreviewBodySchema,
    listWordsQuerySchema,
    moveWordBodySchema,
    parseDomainInput,
    reorderBodySchema,
    roundtripExportQuerySchema,
    updateWordBodySchema
} from '../validators/spellingLibraryValidators.js';

const context = (req) => ({
    schoolId: req.schoolId,
    user: req.user,
    role: req.user?.role
});

export const listSpellingWords = asyncHandler(async (req, res) => {
    const query = parseDomainInput(listWordsQuerySchema, req.query);
    const data = await listLibraryWords({ ...context(req), query });
    return res.json({ success: true, data });
});

export const getSpellingWord = asyncHandler(async (req, res) => {
    const data = await getLibraryWord({ ...context(req), wordId: req.params.wordId });
    return res.json({ success: true, data });
});

export const spellingWordHistory = asyncHandler(async (req, res) => {
    const data = await listLibraryHistory({
        schoolId: req.schoolId,
        wordId: req.params.wordId,
        limit: req.query?.limit,
        cursor: req.query?.cursor
    });
    return res.json({ success: true, data });
});

export const exportSpellingWordLibrary = asyncHandler(async (req, res) => {
    const query = parseDomainInput(roundtripExportQuerySchema, req.query);
    const filter = { school: req.schoolId, deletedAt: null };
    if (query.grade) filter.grade = query.grade;
    const words = await SpellingWord.find(filter)
        .sort({ grade: 1, week: 1, order: 1 })
        .select('grade week category word order definition')
        .lean();
    if (words.length === 0) throw domainError('LIBRARY_EMPTY');
    const roundtrip = query.format === 'roundtrip';
    const csv = roundtrip
        ? buildSpellingWordRoundtripCsv({ words })
        : buildSpellingWordImportCsv({ words });

    res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${roundtrip ? 'spelling-word-library-roundtrip.csv' : 'spelling-word-library.csv'}"`,
        'Cache-Control': 'no-store'
    });
    return res.send(csv);
});

export const exportSpellingWordAudioLibrary = asyncHandler(async (req, res) => {
    const words = await SpellingWord.find({ school: req.schoolId, deletedAt: null })
        .sort({ grade: 1, week: 1, order: 1 })
        .select('grade week category word order definition')
        .lean();
    if (words.length === 0) throw domainError('LIBRARY_EMPTY');
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

export const createSpellingWord = asyncHandler(async (req, res) => {
    const input = parseDomainInput(addWordBodySchema, req.body);
    const result = await addLibraryWord({ ...context(req), input });
    return res.status(201).json({ success: true, data: result });
});

export const updateSpellingWord = asyncHandler(async (req, res) => {
    const input = parseDomainInput(updateWordBodySchema, req.body);
    const result = await updateLibraryWord({
        ...context(req),
        wordId: req.params.wordId,
        input
    });
    return res.json({ success: true, data: result });
});

export const deleteSpellingWord = asyncHandler(async (req, res) => {
    const input = parseDomainInput(deleteWordBodySchema, req.body || {});
    const result = await archiveLibraryWord({
        ...context(req),
        wordId: req.params.wordId,
        input
    });
    return res.json({ success: true, data: result });
});

export const reorderSpellingWeek = asyncHandler(async (req, res) => {
    const input = parseDomainInput(reorderBodySchema, req.body);
    const result = await reorderLibraryWeek({
        ...context(req),
        grade: String(req.params.grade || '').toUpperCase(),
        week: Number(req.params.week),
        input
    });
    return res.json({ success: true, data: result });
});

export const moveSpellingWord = asyncHandler(async (req, res) => {
    const input = parseDomainInput(moveWordBodySchema, req.body);
    const result = await moveLibraryWord({
        ...context(req),
        wordId: req.params.wordId,
        input
    });
    return res.json({ success: true, data: result });
});

export const bulkUpdateSpellingWords = asyncHandler(async (req, res) => {
    const input = parseDomainInput(bulkBodySchema, req.body);
    const result = await bulkLibraryMutation({ ...context(req), input });
    return res.json({ success: true, data: result });
});

export const previewSpellingLibraryImpact = asyncHandler(async (req, res) => {
    const body = parseDomainInput(impactPreviewBodySchema, req.body);
    const data = await previewLibraryOperation({
        ...context(req),
        operation: body.operation,
        expectedLibraryVersions: body.expectedLibraryVersions,
        expectedRevisions: body.expectedRevisions,
        operationId: body.operationId
    });
    return res.json({ success: true, data });
});
