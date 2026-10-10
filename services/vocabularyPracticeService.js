import VocabWord from '../models/VocabWord.js';
import VocabList from '../models/VocabList.js';
import VocabWordSource from '../models/VocabWordSource.js';
import VocabMcq from '../models/VocabMcq.js';
import VocabMatch from '../models/VocabMatch.js';
import VocabAttempt from '../models/VocabAttempt.js';
import VocabMastery from '../models/VocabMastery.js';
import { resolveSelection } from './vocabularyService.js';
import { PRACTICE_TYPES, applyAnswer, effectiveState, gradeAnswer, mcqInScope, orderWords, shuffle } from '../utils/vocabPractice.js';

const badRequest = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const masteryOptions = (settings) => ({ threshold: settings.masteryThreshold, inactivityDays: settings.inactivityDays });

// Voice-panel shape used by the spelling page: { dictionaries: { oxford: { us, uk, examples } } }.
const buildAudio = (sources) => {
    const dictionaries = {};
    for (const source of sources) {
        const entry = {};
        if (source.audioUsUrl) entry.us = source.audioUsUrl;
        if (source.audioUkUrl) entry.uk = source.audioUkUrl;
        if (source.exampleAudioUrl) entry.examples = [source.exampleAudioUrl];
        if (Object.keys(entry).length) dictionaries[source.source] = entry;
    }
    return { dictionaries };
};

// Words for practice; only from lists assigned to this student. Teacher-only fields are omitted.
export async function getPracticeWords({ schoolId, studentId, assignedLists, selection, settings, weakOnly = false }) {
    const listIds = resolveSelection(assignedLists, selection);
    if (!listIds.length) return [];
    const words = await VocabWord.find({ school: schoolId, listId: { $in: listIds } })
        .select('listId word partOfSpeech form baseWord exampleSentence meaning arabicMeaning').lean();
    const wordIds = words.map((word) => word._id);
    const [sources, masteryDocs] = await Promise.all([
        VocabWordSource.find({ school: schoolId, word: { $in: wordIds } }).lean(),
        VocabMastery.find({ school: schoolId, student: studentId, word: { $in: wordIds } }).lean()
    ]);
    const sourcesByWord = new Map();
    for (const source of sources) {
        const key = String(source.word);
        sourcesByWord.set(key, [...(sourcesByWord.get(key) || []), source]);
    }
    const masteryByWord = new Map(masteryDocs.map((doc) => [String(doc.word), doc]));
    const options = masteryOptions(settings);
    const stateOf = (word) => effectiveState(masteryByWord.get(String(word._id)), options);
    const ordered = orderWords(words, stateOf).filter((word) => !weakOnly || ['practicing', 'needs_review'].includes(stateOf(word)));
    return ordered.map((word) => {
        const wordSources = sourcesByWord.get(String(word._id)) || [];
        const mastery = masteryByWord.get(String(word._id));
        return {
            id: word._id,
            listId: word.listId,
            word: word.word,
            partOfSpeech: word.partOfSpeech,
            form: word.form,
            baseWord: word.baseWord,
            exampleSentence: word.exampleSentence,
            meaning: word.meaning,
            arabicMeaning: word.arabicMeaning || undefined,
            audio: buildAudio(wordSources),
            sources: wordSources.map((source) => ({
                source: source.source,
                pageUrl: source.pageUrl,
                definitionText: settings.showDictionaryText ? source.definitionText : ''
            })),
            mastery: { state: stateOf(word), consecutiveCorrect: mastery?.consecutiveCorrect || 0, attempts: mastery?.attempts || 0 }
        };
    });
}

export async function getMcqQuestions({ schoolId, assignedLists, selection, limit = 30 }) {
    const listIds = resolveSelection(assignedLists, selection);
    if (!listIds.length) return [];
    const docs = await VocabMcq.find({ school: schoolId, $or: [{ scopeAll: true }, { listIds: { $in: listIds } }] }).lean();
    return shuffle(docs.filter((doc) => mcqInScope(doc, listIds))).slice(0, limit).map((doc) => ({
        questionId: doc.questionId,
        question: doc.question,
        wordId: doc.word || null,
        options: shuffle(doc.options.map((option) => ({ key: option.key, text: option.text })))
    }));
}

export async function getMatchingSets({ schoolId, assignedLists, selection, limit = 20 }) {
    const listIds = resolveSelection(assignedLists, selection);
    if (!listIds.length) return [];
    const docs = await VocabMatch.find({ school: schoolId, $or: [{ scopeAll: true }, { listIds: { $in: listIds } }] }).lean();
    return shuffle(docs.filter((doc) => mcqInScope(doc, listIds))).slice(0, limit).map((doc) => ({
        questionId: doc.setId,
        instruction: doc.instruction || 'Match each item on the left with its partner.',
        lefts: doc.pairs.map((pair, index) => ({ id: index, text: pair.left })),
        rights: shuffle(doc.pairs.map((pair, index) => ({ id: index, text: pair.right })))
    }));
}

const loadMastery = (schoolId, studentId, wordId) => VocabMastery.findOne({ school: schoolId, student: studentId, word: wordId }).lean();

export async function submitAnswer({ schoolId, student, assignedLists, settings, body }) {
    const type = String(body?.type || '');
    if (!PRACTICE_TYPES.includes(type)) throw badRequest('Unknown practice type');
    const sessionId = String(body?.sessionId || '').slice(0, 64);
    if (!sessionId) throw badRequest('sessionId is required');
    const assignedIds = new Set(assignedLists.map((list) => list.listId));
    const timeMs = Math.max(0, Math.min(Number(body.timeMs) || 0, 3600000));

    let word = null;
    let list = null;
    let mcq = null;
    let chosenWord = null;
    if (type === 'matching') {
        mcq = await VocabMatch.findOne({ school: schoolId, setId: String(body.questionId || '') }).lean();
        if (!mcq || !(mcq.scopeAll ? assignedIds.size > 0 : mcq.listIds.some((id) => assignedIds.has(id)))) throw badRequest('Question not found', 404);
    } else if (type === 'mcq') {
        mcq = await VocabMcq.findOne({ school: schoolId, questionId: String(body.questionId || '') }).lean();
        if (!mcq || !(mcq.scopeAll ? assignedIds.size > 0 : mcq.listIds.some((id) => assignedIds.has(id)))) throw badRequest('Question not found', 404);
        if (mcq.word) word = await VocabWord.findOne({ _id: mcq.word, school: schoolId }).lean();
    } else {
        word = await VocabWord.findOne({ _id: body.wordId, school: schoolId }).lean().catch(() => null);
        if (!word || !assignedIds.has(word.listId)) throw badRequest('Word not found', 404);
        list = await VocabList.findOne({ school: schoolId, listId: word.listId }).select('acceptBaseForm').lean();
        if (type === 'match') {
            chosenWord = await VocabWord.findOne({ _id: body.chosenWordId, school: schoolId }).select('word listId').lean().catch(() => null);
            if (chosenWord && !assignedIds.has(chosenWord.listId)) chosenWord = null;
        }
    }

    const result = gradeAnswer({ type, word, list, mcq, body, chosenWord });
    if (result.error) throw badRequest(result.error);

    await VocabAttempt.create({
        school: schoolId,
        student: student._id,
        sessionId,
        type,
        word: word?._id || null,
        questionId: mcq?.questionId || mcq?.setId || '',
        listId: word?.listId || '',
        given: result.given,
        choice: result.choice || '',
        correct: result.correct,
        status: result.status,
        timeMs
    });

    // Only graded answers about a word move mastery; pending sentences never do.
    let mastery = null;
    if (word && result.correct !== null) {
        const next = applyAnswer(await loadMastery(schoolId, student._id, word._id), result.correct, masteryOptions(settings));
        await VocabMastery.updateOne(
            { school: schoolId, student: student._id, word: word._id },
            { $set: { ...next, listId: word.listId }, $setOnInsert: { school: schoolId, student: student._id, word: word._id } },
            { upsert: true }
        );
        mastery = { state: effectiveState(next, masteryOptions(settings)), consecutiveCorrect: next.consecutiveCorrect };
    }

    return {
        correct: result.correct,
        status: result.status,
        nearMiss: Boolean(result.nearMiss),
        message: result.message || '',
        correctAnswer: result.correctAnswer || '',
        explanation: result.explanation || '',
        meaning: word?.meaning || '',
        mastery
    };
}

export async function getStudentProgress({ schoolId, student, assignedLists, settings }) {
    const listIds = assignedLists.map((list) => list.listId);
    const [words, masteryDocs, attempts, sentences] = await Promise.all([
        VocabWord.find({ school: schoolId, listId: { $in: listIds } }).select('listId').lean(),
        VocabMastery.find({ school: schoolId, student: student._id }).lean(),
        VocabAttempt.find({ school: schoolId, student: student._id, status: 'graded' }).sort({ createdAt: -1 }).limit(300).select('sessionId correct createdAt').lean(),
        VocabAttempt.find({ school: schoolId, student: student._id, type: 'use_it' }).sort({ createdAt: -1 }).limit(20)
            .select('word given status teacherComment createdAt').populate('word', 'word').lean()
    ]);
    const options = masteryOptions(settings);
    const masteryByWord = new Map(masteryDocs.map((doc) => [String(doc.word), doc]));
    const lists = assignedLists.map((list) => {
        const counts = { notStarted: 0, practicing: 0, mastered: 0, needsReview: 0 };
        for (const word of words.filter((entry) => entry.listId === list.listId)) {
            const state = effectiveState(masteryByWord.get(String(word._id)), options);
            if (state === 'not_started') counts.notStarted += 1;
            else if (state === 'practicing') counts.practicing += 1;
            else if (state === 'mastered') counts.mastered += 1;
            else counts.needsReview += 1;
        }
        return { listId: list.listId, title: list.title, total: list.wordCount, ...counts };
    });
    const sessions = new Map();
    for (const attempt of attempts) {
        const entry = sessions.get(attempt.sessionId) || { sessionId: attempt.sessionId, date: attempt.createdAt, total: 0, correct: 0 };
        entry.total += 1;
        if (attempt.correct) entry.correct += 1;
        sessions.set(attempt.sessionId, entry);
    }
    return {
        lists,
        weakCount: lists.reduce((sum, list) => sum + list.practicing + list.needsReview, 0),
        recentSessions: [...sessions.values()].slice(0, 8),
        sentences: sentences.map((entry) => ({
            id: entry._id,
            word: entry.word?.word || '',
            sentence: entry.given,
            status: entry.status,
            teacherComment: entry.teacherComment,
            createdAt: entry.createdAt
        }))
    };
}
