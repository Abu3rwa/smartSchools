import { asyncHandler } from '../middleware/errorHandler.js';
import VocabList from '../models/VocabList.js';
import VocabWord from '../models/VocabWord.js';
import VocabWordSource from '../models/VocabWordSource.js';
import {
    SOURCES,
    WORD_FORMS,
    buildTemplateCsv,
    isHttpUrl,
    normalizeListId,
    normalizeWord,
    parsePartOfSpeech,
    posKeyOf
} from '../utils/vocabCsv.js';
import {
    getAllowedClassIds,
    getAssignedLists,
    getListAssignments,
    getStudentForUser,
    getStudentPrefs,
    getVocabSettings,
    runVocabImport,
    saveStudentPrefs,
    seedVocabulary,
    setListAssignments,
    updateVocabSettings
} from '../services/vocabularyService.js';
import { getMcqQuestions, getPracticeWords, getStudentProgress, submitAnswer } from '../services/vocabularyPracticeService.js';
import { buildReport, listReviews, reportToCsv, reviewAttempt } from '../services/vocabularyReportService.js';
import { checkAudioUrls } from '../services/vocabularyAudioCheck.js';

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const handleServiceError = (res, error) => {
    if (error?.statusCode) return fail(res, error.statusCode, error.message);
    if (error?.code === 11000) return fail(res, 409, 'That record already exists');
    throw error;
};

const guarded = (handler) => asyncHandler(async (req, res) => {
    try {
        return await handler(req, res);
    } catch (error) {
        return handleServiceError(res, error);
    }
});

const clampInt = (value, min, max) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max ? number : null;
};

// ---- Staff: settings -----------------------------------------------------

export const getSettings = guarded(async (req, res) => res.json({ success: true, data: await getVocabSettings(req.schoolId) }));

export const patchSettings = guarded(async (req, res) => {
    const patch = {};
    const body = req.body || {};
    if (body.enabled !== undefined) patch.enabled = body.enabled === true;
    if (body.showDictionaryText !== undefined) patch.showDictionaryText = body.showDictionaryText === true;
    if (body.masteryThreshold !== undefined) {
        patch.masteryThreshold = clampInt(body.masteryThreshold, 1, 10);
        if (patch.masteryThreshold === null) return fail(res, 400, 'masteryThreshold must be a whole number from 1 to 10');
    }
    if (body.inactivityDays !== undefined) {
        patch.inactivityDays = clampInt(body.inactivityDays, 1, 90);
        if (patch.inactivityDays === null) return fail(res, 400, 'inactivityDays must be a whole number from 1 to 90');
    }
    return res.json({ success: true, data: await updateVocabSettings(req.schoolId, patch) });
});

// ---- Staff: lists ----------------------------------------------------------

export const listLists = guarded(async (req, res) => {
    const lists = await VocabList.find({ school: req.schoolId }).sort({ semester: 1, order: 1, listNumber: 1 }).lean();
    const words = await VocabWord.find({ school: req.schoolId }).select('listId').lean();
    const counts = new Map();
    for (const word of words) counts.set(word.listId, (counts.get(word.listId) || 0) + 1);
    return res.json({ success: true, data: lists.map((list) => ({ ...list, wordCount: counts.get(list.listId) || 0 })) });
});

export const patchList = guarded(async (req, res) => {
    const listId = normalizeListId(req.params.listId);
    const body = req.body || {};
    const update = {};
    if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (!title) return fail(res, 400, 'title cannot be empty');
        update.title = title.slice(0, 200);
    }
    if (body.lessonTitle !== undefined) update.lessonTitle = String(body.lessonTitle).trim().slice(0, 200);
    if (body.order !== undefined) {
        const order = Number(body.order);
        if (!Number.isFinite(order) || order < 0) return fail(res, 400, 'order must be a number');
        update.order = order;
    }
    if (body.visible !== undefined) update.visible = body.visible === true;
    if (body.acceptBaseForm !== undefined) update.acceptBaseForm = body.acceptBaseForm === true;
    const list = await VocabList.findOneAndUpdate({ school: req.schoolId, listId }, { $set: update }, { new: true }).lean();
    if (!list) return fail(res, 404, 'List not found');
    return res.json({ success: true, data: list });
});

export const getAssignments = guarded(async (req, res) => {
    const listId = normalizeListId(req.params.listId);
    if (!(await VocabList.exists({ school: req.schoolId, listId }))) return fail(res, 404, 'List not found');
    const allowedClassIds = await getAllowedClassIds(req);
    return res.json({ success: true, data: await getListAssignments({ schoolId: req.schoolId, listId, allowedClassIds }) });
});

export const putAssignments = guarded(async (req, res) => {
    const listId = normalizeListId(req.params.listId);
    if (!(await VocabList.exists({ school: req.schoolId, listId }))) return fail(res, 404, 'List not found');
    const { classIds = [], studentIds = [] } = req.body || {};
    if (!Array.isArray(classIds) || !Array.isArray(studentIds)) return fail(res, 400, 'classIds and studentIds must be arrays');
    const allowedClassIds = await getAllowedClassIds(req);
    const data = await setListAssignments({ schoolId: req.schoolId, listId, classIds, studentIds, allowedClassIds });
    return res.json({ success: true, data });
});

// ---- Staff: words and sources ---------------------------------------------

export const listWords = guarded(async (req, res) => {
    const listId = normalizeListId(req.query.listId);
    if (!listId) return fail(res, 400, 'listId is required');
    const words = await VocabWord.find({ school: req.schoolId, listId }).sort({ normalizedWord: 1 }).lean();
    return res.json({ success: true, data: words });
});

const WORD_TEXT_FIELDS = ['exampleSentence', 'meaning', 'arabicMeaning', 'notes'];

const buildWordFields = (body, { partial }) => {
    const fields = {};
    if (body.word !== undefined || !partial) {
        const word = String(body.word || '').trim();
        if (!word) return { error: 'word is required' };
        fields.word = word.slice(0, 120);
        fields.normalizedWord = normalizeWord(word);
    }
    if (body.partOfSpeech !== undefined || !partial) {
        const input = Array.isArray(body.partOfSpeech) ? body.partOfSpeech.join('/') : body.partOfSpeech;
        const partOfSpeech = parsePartOfSpeech(input);
        if (!partOfSpeech) return { error: 'partOfSpeech must use n, v, adj or adv' };
        fields.partOfSpeech = partOfSpeech;
        fields.posKey = posKeyOf(partOfSpeech);
    }
    if (body.form !== undefined) {
        const form = String(body.form).trim().toLowerCase();
        if (form && !WORD_FORMS.includes(form)) return { error: `form must be one of ${WORD_FORMS.join(', ')} or empty` };
        fields.form = form;
    }
    if (body.baseWord !== undefined) fields.baseWord = String(body.baseWord).trim().slice(0, 120);
    for (const key of WORD_TEXT_FIELDS) if (body[key] !== undefined) fields[key] = String(body[key]).trim().slice(0, 1000);
    if (body.verified !== undefined) fields.verified = body.verified === true;
    return { fields };
};

export const createWord = guarded(async (req, res) => {
    const listId = normalizeListId(req.body?.listId);
    if (!(await VocabList.exists({ school: req.schoolId, listId }))) return fail(res, 404, 'List not found');
    const { fields, error } = buildWordFields(req.body || {}, { partial: false });
    if (error) return fail(res, 400, error);
    if (fields.form && !fields.baseWord) return fail(res, 400, 'baseWord is required when form is set');
    const word = await VocabWord.create({ ...fields, school: req.schoolId, listId });
    return res.status(201).json({ success: true, data: word });
});

export const patchWord = guarded(async (req, res) => {
    const { fields, error } = buildWordFields(req.body || {}, { partial: true });
    if (error) return fail(res, 400, error);
    const existing = await VocabWord.findOne({ _id: req.params.id, school: req.schoolId }).lean();
    if (!existing) return fail(res, 404, 'Word not found');
    const form = fields.form ?? existing.form;
    const baseWord = fields.baseWord ?? existing.baseWord;
    if (form && !baseWord) return fail(res, 400, 'baseWord is required when form is set');
    const word = await VocabWord.findOneAndUpdate({ _id: req.params.id, school: req.schoolId }, { $set: fields }, { new: true, runValidators: true }).lean();
    return res.json({ success: true, data: word });
});

export const listWordSources = guarded(async (req, res) => {
    if (!(await VocabWord.exists({ _id: req.params.id, school: req.schoolId }))) return fail(res, 404, 'Word not found');
    const sources = await VocabWordSource.find({ school: req.schoolId, word: req.params.id }).lean();
    return res.json({ success: true, data: sources });
});

export const putWordSource = guarded(async (req, res) => {
    const source = String(req.params.source || '').toLowerCase();
    if (!SOURCES.includes(source)) return fail(res, 400, `source must be one of ${SOURCES.join(', ')}`);
    if (!(await VocabWord.exists({ _id: req.params.id, school: req.schoolId }))) return fail(res, 404, 'Word not found');
    const body = req.body || {};
    const fields = { definitionText: String(body.definitionText || '').trim().slice(0, 3000) };
    for (const key of ['pageUrl', 'audioUsUrl', 'audioUkUrl', 'exampleAudioUrl']) {
        const value = String(body[key] || '').trim();
        if (value && !isHttpUrl(value)) return fail(res, 400, `${key} must be an http(s) URL`);
        fields[key] = value;
    }
    const doc = await VocabWordSource.findOneAndUpdate(
        { school: req.schoolId, word: req.params.id, source },
        { $set: fields, $setOnInsert: { school: req.schoolId, word: req.params.id, source } },
        { upsert: true, new: true }
    ).lean();
    return res.json({ success: true, data: doc });
});

// ---- Staff: import and seed -------------------------------------------------

export const downloadTemplate = guarded(async (req, res) => {
    const csv = buildTemplateCsv(req.params.type);
    if (!csv) return fail(res, 404, 'Unknown template');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}.csv"`);
    return res.send(csv);
});

export const importCsv = guarded(async (req, res) => {
    if (!req.file) return fail(res, 400, 'CSV file is required');
    const result = await runVocabImport({
        schoolId: req.schoolId,
        type: req.params.type,
        content: req.file.buffer.toString('utf8'),
        mode: req.body?.mode === 'add-only' ? 'add-only' : 'update',
        dryRun: req.body?.dryRun !== 'false'
    });
    return res.json({ success: true, data: result });
});

export const seed = guarded(async (req, res) => res.json({ success: true, data: await seedVocabulary({ schoolId: req.schoolId }) }));

// ---- Student ---------------------------------------------------------------------

const loadStudentContext = async (req, res) => {
    const settings = await getVocabSettings(req.schoolId);
    if (!settings.enabled) return { disabled: true, settings };
    const student = await getStudentForUser(req);
    if (!student) {
        fail(res, 403, 'No student profile is linked to this account');
        return { handled: true };
    }
    const lists = await getAssignedLists({ schoolId: req.schoolId, student });
    return { settings, student, lists };
};

export const studentOverview = guarded(async (req, res) => {
    const context = await loadStudentContext(req, res);
    if (context.handled) return undefined;
    if (context.disabled) return res.json({ success: true, data: { enabled: false, lists: [], selection: { listIds: [], all: false } } });
    const selection = await getStudentPrefs({ schoolId: req.schoolId, studentId: context.student._id, assignedLists: context.lists });
    return res.json({ success: true, data: { enabled: true, lists: context.lists, selection } });
});

export const studentSaveSelection = guarded(async (req, res) => {
    const context = await loadStudentContext(req, res);
    if (context.handled) return undefined;
    if (context.disabled) return fail(res, 403, 'Vocabulary practice is not available yet');
    const { listIds = [], all = false } = req.body || {};
    if (!Array.isArray(listIds)) return fail(res, 400, 'listIds must be an array');
    const selection = await saveStudentPrefs({
        schoolId: req.schoolId,
        studentId: context.student._id,
        assignedLists: context.lists,
        selection: { listIds, all }
    });
    return res.json({ success: true, data: selection });
});

// An explicit query wins; otherwise use the lists the student saved on the Choose lists tab.
const loadSelection = async (req, context) => {
    const listIds = String(req.query.listIds || '').split(',').map((id) => id.trim()).filter(Boolean);
    if (listIds.length || req.query.all === 'true') return { listIds, all: req.query.all === 'true' };
    return getStudentPrefs({ schoolId: req.schoolId, studentId: context.student._id, assignedLists: context.lists });
};
export const studentWords = guarded(async (req, res) => {
    const context = await loadStudentContext(req, res);
    if (context.handled) return undefined;
    if (context.disabled) return fail(res, 403, 'Vocabulary practice is not available yet');
    const words = await getPracticeWords({
        schoolId: req.schoolId,
        studentId: context.student._id,
        assignedLists: context.lists,
        selection: await loadSelection(req, context),
        settings: context.settings,
        weakOnly: req.query.weak === 'true'
    });
    return res.json({ success: true, data: { words, settings: { masteryThreshold: context.settings.masteryThreshold, showDictionaryText: context.settings.showDictionaryText } } });
});

export const studentMcq = guarded(async (req, res) => {
    const context = await loadStudentContext(req, res);
    if (context.handled) return undefined;
    if (context.disabled) return fail(res, 403, 'Vocabulary practice is not available yet');
    const questions = await getMcqQuestions({ schoolId: req.schoolId, assignedLists: context.lists, selection: await loadSelection(req, context) });
    return res.json({ success: true, data: questions });
});

export const studentAnswer = guarded(async (req, res) => {
    const context = await loadStudentContext(req, res);
    if (context.handled) return undefined;
    if (context.disabled) return fail(res, 403, 'Vocabulary practice is not available yet');
    const result = await submitAnswer({ schoolId: req.schoolId, student: context.student, assignedLists: context.lists, settings: context.settings, body: req.body || {} });
    return res.json({ success: true, data: result });
});

export const studentProgress = guarded(async (req, res) => {
    const context = await loadStudentContext(req, res);
    if (context.handled) return undefined;
    if (context.disabled) return fail(res, 403, 'Vocabulary practice is not available yet');
    const progress = await getStudentProgress({ schoolId: req.schoolId, student: context.student, assignedLists: context.lists, settings: context.settings });
    return res.json({ success: true, data: progress });
});

// ---- Staff: reports, review queue, audio check -----------------------------------------

export const getReport = guarded(async (req, res) => {
    const report = await buildReport(req, req.params.name, req.query);
    if (req.query.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="vocabulary-${report.name}.csv"`);
        return res.send(reportToCsv(report));
    }
    return res.json({ success: true, data: report });
});

export const getReviews = guarded(async (req, res) => res.json({ success: true, data: await listReviews(req, req.query) }));

export const patchReview = guarded(async (req, res) => {
    const data = await reviewAttempt(req, req.params.id, { status: req.body?.status, comment: req.body?.comment });
    return res.json({ success: true, data });
});

export const audioCheck = guarded(async (req, res) => {
    const data = await checkAudioUrls({ schoolId: req.schoolId, listId: normalizeListId(req.body?.listId), offset: req.body?.offset });
    return res.json({ success: true, data });
});