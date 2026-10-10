import VocabList from '../models/VocabList.js';
import VocabWord from '../models/VocabWord.js';
import VocabWordSource from '../models/VocabWordSource.js';
import VocabSettings from '../models/VocabSettings.js';
import VocabAssignment from '../models/VocabAssignment.js';
import VocabStudentPrefs from '../models/VocabStudentPrefs.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import { getTeacherClassIds, resolveTeacherProfile } from '../helpers/teacherScoping.js';
import {
    parseCsvTable,
    validateListRows,
    validateSourceRows,
    validateWordRows,
    IMPORT_TYPES,
    expandCombinedRows
} from '../utils/vocabCsv.js';
import { buildSeedData } from '../utils/vocabSeed.js';

export const DEFAULT_SETTINGS = Object.freeze({ enabled: false, masteryThreshold: 2, inactivityDays: 7, showDictionaryText: true });

const SETTINGS_FIELDS = ['enabled', 'masteryThreshold', 'inactivityDays', 'showDictionaryText'];

export const getVocabSettings = async (schoolId) => {
    const doc = await VocabSettings.findOne({ school: schoolId }).lean();
    return { ...DEFAULT_SETTINGS, ...(doc ? Object.fromEntries(SETTINGS_FIELDS.map((key) => [key, doc[key]])) : {}) };
};

export const updateVocabSettings = async (schoolId, patch) => {
    const update = {};
    for (const key of SETTINGS_FIELDS) if (patch[key] !== undefined) update[key] = patch[key];
    await VocabSettings.findOneAndUpdate(
        { school: schoolId },
        { $set: update, $setOnInsert: { school: schoolId } },
        { upsert: true, runValidators: true }
    );
    return getVocabSettings(schoolId);
};

// ---- Imports -------------------------------------------------------------

const wordKeyOf = (row) => `${row.listId}|${row.normalizedWord}|${row.posKey}`;

const emptySummary = () => ({ created: 0, updated: 0, skipped: 0 });

const applyLists = async ({ schoolId, valid, knownListIds, addOnly, dryRun }) => {
    const stats = emptySummary();
    const operations = [];
    for (const row of valid) {
        const fields = { semester: row.semester, listNumber: row.listNumber, title: row.title, lessonTitle: row.lessonTitle, order: row.order, visible: row.visible };
        if (knownListIds.has(row.listId)) {
            if (addOnly) { stats.skipped += 1; continue; }
            stats.updated += 1;
            operations.push({ updateOne: { filter: { school: schoolId, listId: row.listId }, update: { $set: fields } } });
        } else {
            stats.created += 1;
            operations.push({ updateOne: { filter: { school: schoolId, listId: row.listId }, update: { $set: fields, $setOnInsert: { school: schoolId, listId: row.listId } }, upsert: true } });
        }
    }
    if (!dryRun && operations.length) await VocabList.bulkWrite(operations);
    return stats;
};

const applyWords = async ({ schoolId, valid, addOnly, dryRun }) => {
    const stats = emptySummary();
    const existingWords = await VocabWord.find({ school: schoolId, listId: { $in: [...new Set(valid.map((row) => row.listId))] } }).select('listId normalizedWord posKey').lean();
    const existing = new Set(existingWords.map(wordKeyOf));
    const operations = [];
    for (const row of valid) {
        const fields = {
            word: row.word,
            partOfSpeech: row.partOfSpeech,
            form: row.form,
            baseWord: row.baseWord,
            exampleSentence: row.exampleSentence,
            meaning: row.meaning,
            arabicMeaning: row.arabicMeaning,
            notes: row.notes
        };
        const identity = { school: schoolId, listId: row.listId, normalizedWord: row.normalizedWord, posKey: row.posKey };
        if (existing.has(wordKeyOf(row))) {
            if (addOnly) { stats.skipped += 1; continue; }
            stats.updated += 1;
            operations.push({ updateOne: { filter: identity, update: { $set: fields } } });
        } else {
            stats.created += 1;
            operations.push({ updateOne: { filter: identity, update: { $set: fields, $setOnInsert: identity }, upsert: true } });
        }
    }
    if (!dryRun && operations.length) await VocabWord.bulkWrite(operations);
    return stats;
};

// pendingWordKeys: words that will exist once the same file is applied (used by the combined import's dry run).
const applySources = async ({ schoolId, valid, addOnly, dryRun, errors, pendingWordKeys = new Set() }) => {
    const stats = emptySummary();
    stats.invalid = 0;
    const words = await VocabWord.find({ school: schoolId, listId: { $in: [...new Set(valid.map((row) => row.listId))] } }).select('listId normalizedWord posKey').lean();
    const wordIds = new Map(words.map((word) => [wordKeyOf(word), word._id]));
    const existingSources = await VocabWordSource.find({ school: schoolId, word: { $in: [...wordIds.values()] } }).select('word source').lean();
    const existing = new Set(existingSources.map((entry) => `${entry.word}|${entry.source}`));
    const operations = [];
    for (const row of valid) {
        const wordId = wordIds.get(wordKeyOf(row));
        if (!wordId) {
            if (pendingWordKeys.has(wordKeyOf(row))) { stats.created += 1; continue; }
            errors.push({ row: row.rowNumber, column: 'word', message: 'No matching word for this list, word and part of speech; import the word first' });
            stats.invalid += 1;
            continue;
        }
        const fields = { definitionText: row.definitionText, pageUrl: row.pageUrl, audioUsUrl: row.audioUsUrl, audioUkUrl: row.audioUkUrl, exampleAudioUrl: row.exampleAudioUrl };
        const identity = { school: schoolId, word: wordId, source: row.source };
        if (existing.has(`${wordId}|${row.source}`)) {
            if (addOnly) { stats.skipped += 1; continue; }
            stats.updated += 1;
            operations.push({ updateOne: { filter: identity, update: { $set: fields } } });
        } else {
            stats.created += 1;
            operations.push({ updateOne: { filter: identity, update: { $set: fields, $setOnInsert: identity }, upsert: true } });
        }
    }
    if (!dryRun && operations.length) await VocabWordSource.bulkWrite(operations);
    return stats;
};

const addStats = (...parts) => parts.reduce((sum, part) => ({
    created: sum.created + part.created, updated: sum.updated + part.updated, skipped: sum.skipped + part.skipped
}), emptySummary());

export async function runVocabImport({ schoolId, type, content, mode = 'update', dryRun = true }) {
    if (!IMPORT_TYPES.includes(type)) {
        const error = new Error('Unknown import type');
        error.statusCode = 400;
        throw error;
    }
    let table;
    try {
        table = parseCsvTable(content, type);
    } catch (error) {
        return { ok: false, fatal: error.message, errors: [], summary: null, dryRun };
    }

    const lists = await VocabList.find({ school: schoolId }).select('listId').lean();
    const knownListIds = new Set(lists.map((list) => list.listId));
    const addOnly = mode === 'add-only';
    const rowCount = table.rows.length;
    const finish = (errors, stats, details) => {
        errors.sort((a, b) => a.row - b.row);
        const summary = {
            rows: rowCount,
            created: stats.created,
            updated: stats.updated,
            skipped: stats.skipped,
            invalid: new Set(errors.map((entry) => entry.row)).size,
            ...(details ? { details } : {})
        };
        return { ok: errors.length === 0, errors, summary, dryRun, applied: !dryRun };
    };

    if (type === 'combined') {
        const expanded = expandCombinedRows(table.rows);
        const listCheck = validateListRows(expanded.listRows);
        const fileListIds = new Set([...knownListIds, ...listCheck.valid.map((row) => row.listId)]);
        const wordCheck = validateWordRows(expanded.wordRows, fileListIds);
        const sourceCheck = validateSourceRows(expanded.sourceRows, fileListIds);
        const errors = [...listCheck.errors, ...wordCheck.errors, ...sourceCheck.errors];
        const failedWordRows = new Set(wordCheck.errors.map((entry) => entry.row));
        const sources = sourceCheck.valid.filter((row) => !failedWordRows.has(row.rowNumber));
        const lookupLists = new Set(knownListIds);
        const listStats = await applyLists({ schoolId, valid: listCheck.valid, knownListIds: lookupLists, addOnly, dryRun });
        const wordStats = await applyWords({ schoolId, valid: wordCheck.valid, addOnly, dryRun });
        const pendingWordKeys = new Set(wordCheck.valid.map(wordKeyOf));
        const sourceStats = await applySources({ schoolId, valid: sources, addOnly, dryRun, errors, pendingWordKeys });
        return finish(errors, addStats(listStats, wordStats, sourceStats), { lists: listStats, words: wordStats, sources: sourceStats });
    }

    let validation;
    if (type === 'lists') validation = validateListRows(table.rows);
    else if (type === 'words') validation = validateWordRows(table.rows, knownListIds);
    else validation = validateSourceRows(table.rows, knownListIds);
    const { valid, errors } = validation;

    let stats;
    if (type === 'lists') stats = await applyLists({ schoolId, valid, knownListIds, addOnly, dryRun });
    else if (type === 'words') stats = await applyWords({ schoolId, valid, addOnly, dryRun });
    else stats = await applySources({ schoolId, valid, addOnly, dryRun, errors });
    return finish(errors, stats);
}

export async function seedVocabulary({ schoolId }) {
    const { lists, words } = buildSeedData();
    await VocabList.bulkWrite(lists.map((list) => ({
        updateOne: {
            filter: { school: schoolId, listId: list.listId },
            update: { $setOnInsert: { school: schoolId, ...list, visible: true } },
            upsert: true
        }
    })));
    await VocabWord.bulkWrite(words.map((word) => {
        const { listId, normalizedWord, posKey, ...rest } = word;
        return {
            updateOne: {
                filter: { school: schoolId, listId, normalizedWord, posKey },
                update: { $setOnInsert: { school: schoolId, listId, normalizedWord, posKey, ...rest } },
                upsert: true
            }
        };
    }));
    return { lists: lists.length, words: words.length };
}

// ---- Scope and assignments ----------------------------------------------

// Class ids the requesting staff member may manage.
export const getAllowedClassIds = async (req) => {
    const role = req.user?.role;
    if (role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        return teacher ? (await getTeacherClassIds(teacher._id)).map(String) : [];
    }
    const filter = { school: req.schoolId };
    if (role === 'department_principal') {
        if (!req.departmentId) return [];
        filter.department = req.departmentId;
    }
    return (await Class.find(filter).select('_id').lean()).map((doc) => String(doc._id));
};

export async function getListAssignments({ schoolId, listId, allowedClassIds }) {
    const classes = await VocabAssignment.find({ school: schoolId, listId, class: { $in: allowedClassIds } }).select('class').lean();
    const students = await Student.find({
        school: schoolId,
        $or: [{ currentClass: { $in: allowedClassIds } }, { enrolledClasses: { $in: allowedClassIds } }]
    }).select('_id').lean();
    const studentAssignments = await VocabAssignment.find({ school: schoolId, listId, student: { $in: students.map((student) => student._id) } }).select('student').lean();
    return {
        classIds: classes.map((entry) => String(entry.class)),
        studentIds: studentAssignments.map((entry) => String(entry.student))
    };
}

// Replaces this list's assignments, touching only classes and students within the caller's scope.
export async function setListAssignments({ schoolId, listId, classIds = [], studentIds = [], allowedClassIds }) {
    const allowed = new Set(allowedClassIds.map(String));
    if (classIds.some((id) => !allowed.has(String(id)))) {
        const error = new Error('You can only assign lists to your own classes');
        error.statusCode = 403;
        throw error;
    }
    const scopedStudents = await Student.find({
        school: schoolId,
        $or: [{ currentClass: { $in: allowedClassIds } }, { enrolledClasses: { $in: allowedClassIds } }]
    }).select('_id').lean();
    const scopedStudentIds = new Set(scopedStudents.map((student) => String(student._id)));
    if (studentIds.some((id) => !scopedStudentIds.has(String(id)))) {
        const error = new Error('You can only assign lists to students in your own classes');
        error.statusCode = 403;
        throw error;
    }
    await VocabAssignment.deleteMany({ school: schoolId, listId, class: { $in: allowedClassIds } });
    await VocabAssignment.deleteMany({ school: schoolId, listId, student: { $in: [...scopedStudentIds] } });
    const docs = [
        ...classIds.map((id) => ({ school: schoolId, listId, class: id, student: null })),
        ...studentIds.map((id) => ({ school: schoolId, listId, class: null, student: id }))
    ];
    if (docs.length) await VocabAssignment.insertMany(docs);
    return { classIds: classIds.map(String), studentIds: studentIds.map(String) };
}

// ---- Student side ---------------------------------------------------------

export async function getStudentForUser(req) {
    return Student.findOne({ user: req.user._id, school: req.schoolId }).select('_id currentClass enrolledClasses').lean();
}

export async function getAssignedLists({ schoolId, student }) {
    const classIds = [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean);
    const assignments = await VocabAssignment.find({
        school: schoolId,
        $or: [{ student: student._id }, { class: { $in: classIds } }]
    }).select('listId').lean();
    const listIds = [...new Set(assignments.map((entry) => entry.listId))];
    if (!listIds.length) return [];
    const lists = await VocabList.find({ school: schoolId, listId: { $in: listIds }, visible: true })
        .sort({ semester: 1, order: 1, listNumber: 1 }).lean();
    const wordDocs = await VocabWord.find({ school: schoolId, listId: { $in: lists.map((list) => list.listId) } }).select('listId').lean();
    const countByList = new Map();
    for (const doc of wordDocs) countByList.set(doc.listId, (countByList.get(doc.listId) || 0) + 1);
    return lists.map((list) => ({
        listId: list.listId,
        title: list.title,
        lessonTitle: list.lessonTitle,
        semester: list.semester,
        wordCount: countByList.get(list.listId) || 0
    }));
}

// Resolve a selection to the lists the student may actually practise (never trusts client list ids).
export const resolveSelection = (assignedLists, { listIds = [], all = false }) => {
    const assignedIds = new Set(assignedLists.map((list) => list.listId));
    if (all) return [...assignedIds];
    return [...new Set(listIds.map((id) => String(id).toUpperCase()))].filter((id) => assignedIds.has(id));
};

export async function getStudentPrefs({ schoolId, studentId, assignedLists }) {
    const prefs = await VocabStudentPrefs.findOne({ school: schoolId, student: studentId }).lean();
    if (!prefs) return { listIds: [], all: false };
    return { all: prefs.all, listIds: resolveSelection(assignedLists, { listIds: prefs.listIds }) };
}

export async function saveStudentPrefs({ schoolId, studentId, assignedLists, selection }) {
    const listIds = resolveSelection(assignedLists, { listIds: selection.listIds });
    const all = selection.all === true;
    await VocabStudentPrefs.findOneAndUpdate(
        { school: schoolId, student: studentId },
        { $set: { listIds, all }, $setOnInsert: { school: schoolId, student: studentId } },
        { upsert: true }
    );
    return { listIds, all };
}

// Words for practice; only from lists that are assigned and visible to this student. Teacher-only fields are omitted.
export async function getPracticeWords({ schoolId, assignedLists, selection }) {
    const listIds = resolveSelection(assignedLists, selection);
    if (!listIds.length) return [];
    const words = await VocabWord.find({ school: schoolId, listId: { $in: listIds } })
        .select('listId word partOfSpeech form baseWord exampleSentence meaning arabicMeaning')
        .sort({ listId: 1, normalizedWord: 1 }).lean();
    return words.map((word) => ({
        id: word._id,
        listId: word.listId,
        word: word.word,
        partOfSpeech: word.partOfSpeech,
        form: word.form,
        baseWord: word.baseWord,
        exampleSentence: word.exampleSentence,
        meaning: word.meaning,
        arabicMeaning: word.arabicMeaning || undefined
    }));
}
