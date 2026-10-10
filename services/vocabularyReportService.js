import Student from '../models/Student.js';
import VocabAttempt from '../models/VocabAttempt.js';
import VocabMastery from '../models/VocabMastery.js';
import VocabMcq from '../models/VocabMcq.js';
import VocabWord from '../models/VocabWord.js';
import VocabList from '../models/VocabList.js';
import { getAllowedClassIds, getVocabSettings } from './vocabularyService.js';
import { effectiveState, mcqInScope } from '../utils/vocabPractice.js';
import { REPORT_TABLES, classOverview, inactiveStudents, mcqAnalysis, studentDetail, wordDifficulty } from '../utils/vocabReports.js';
import { normalizeListId, toCsv } from '../utils/vocabCsv.js';

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const MAX_ATTEMPTS = 50000;

// Students the caller may see: only those in the caller's own classes (admins: whole school).
export async function resolveReportScope(req, query = {}) {
    const allowedClassIds = await getAllowedClassIds(req);
    let classIds = allowedClassIds;
    if (query.classId) {
        if (!allowedClassIds.includes(String(query.classId))) throw httpError('You do not have access to that class', 403);
        classIds = [String(query.classId)];
    }
    const students = classIds.length
        ? await Student.find({ school: req.schoolId, $or: [{ currentClass: { $in: classIds } }, { enrolledClasses: { $in: classIds } }] }).select('firstName lastName').lean()
        : [];
    if (query.studentId) {
        const match = students.find((student) => String(student._id) === String(query.studentId));
        if (!match) throw httpError('You do not have access to that student', 403);
        return { students: [match], allowedClassIds };
    }
    return { students, allowedClassIds };
}

const parseDate = (value, endOfDay = false) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw httpError('Invalid date', 400);
    if (endOfDay) date.setHours(23, 59, 59, 999);
    return date;
};

const buildAttemptFilter = (schoolId, students, query, { ignoreList = false } = {}) => {
    const filter = { school: schoolId, student: { $in: students.map((student) => student._id) } };
    const from = parseDate(query.from);
    const to = parseDate(query.to, true);
    if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    if (!ignoreList) {
        if (query.listId) filter.listId = normalizeListId(query.listId);
        else if (query.semester === '1' || query.semester === '2') filter.listId = new RegExp(`^S${query.semester}-`);
    }
    return filter;
};

const loadAttempts = (filter) => VocabAttempt.find(filter)
    .select('student sessionId type word questionId listId given choice correct createdAt timeMs')
    .sort({ createdAt: -1 }).limit(MAX_ATTEMPTS).lean();

export async function buildReport(req, name, query = {}) {
    const schoolId = req.schoolId;
    const { students } = await resolveReportScope(req, query);
    const settings = await getVocabSettings(schoolId);

    if (name === 'overview') {
        const lists = await VocabList.find({ school: schoolId }).sort({ semester: 1, order: 1 }).select('listId semester').lean();
        const wanted = lists.filter((list) => (!query.listId || list.listId === normalizeListId(query.listId)) && (!query.semester || String(list.semester) === String(query.semester)));
        const attempts = await loadAttempts(buildAttemptFilter(schoolId, students, query));
        return { name, rows: classOverview(attempts, wanted.map((list) => list.listId), students.length), meta: { students: students.length } };
    }

    if (name === 'words') {
        const attempts = await loadAttempts(buildAttemptFilter(schoolId, students, query));
        const words = await VocabWord.find({ school: schoolId, _id: { $in: [...new Set(attempts.map((attempt) => attempt.word).filter(Boolean))] } }).select('word listId').lean();
        return { name, rows: wordDifficulty(attempts, new Map(words.map((word) => [String(word._id), word]))) };
    }

    if (name === 'student') {
        if (!query.studentId) throw httpError('studentId is required', 400);
        const attempts = await loadAttempts(buildAttemptFilter(schoolId, students, query));
        const wordIds = [...new Set(attempts.map((attempt) => attempt.word).filter(Boolean))];
        const [words, masteryDocs] = await Promise.all([
            VocabWord.find({ school: schoolId, _id: { $in: wordIds } }).select('word listId').lean(),
            VocabMastery.find({ school: schoolId, student: query.studentId, word: { $in: wordIds } }).lean()
        ]);
        const detail = studentDetail(
            attempts,
            new Map(words.map((word) => [String(word._id), word])),
            new Map(masteryDocs.map((doc) => [String(doc.word), doc])),
            { threshold: settings.masteryThreshold, inactivityDays: settings.inactivityDays, stateOf: effectiveState }
        );
        return { name, rows: detail.words, meta: { minutesPracticed: detail.minutesPracticed, recentSessions: detail.recentSessions, student: `${students[0].firstName || ''} ${students[0].lastName || ''}`.trim() } };
    }

    if (name === 'mcq') {
        const attempts = await loadAttempts({ ...buildAttemptFilter(schoolId, students, query, { ignoreList: true }), type: 'mcq' });
        const questions = await VocabMcq.find({ school: schoolId, questionId: { $in: [...new Set(attempts.map((attempt) => attempt.questionId))] } }).lean();
        const listFilter = query.listId ? [normalizeListId(query.listId)] : null;
        const kept = listFilter ? questions.filter((question) => mcqInScope(question, listFilter)) : questions;
        const keptIds = new Set(kept.map((question) => question.questionId));
        return { name, rows: mcqAnalysis(attempts.filter((attempt) => keptIds.has(attempt.questionId)), new Map(kept.map((question) => [question.questionId, question]))) };
    }

    if (name === 'inactive') {
        const days = Math.min(365, Math.max(1, Number(query.days) || settings.inactivityDays));
        const latest = await VocabAttempt.find({ school: schoolId, student: { $in: students.map((student) => student._id) } })
            .sort({ createdAt: -1 }).select('student createdAt').limit(MAX_ATTEMPTS).lean();
        const lastSeen = new Map();
        for (const attempt of latest) if (!lastSeen.has(String(attempt.student))) lastSeen.set(String(attempt.student), attempt.createdAt);
        return { name, rows: inactiveStudents(students, lastSeen, days), meta: { days } };
    }

    throw httpError('Unknown report', 404);
}

// Spreadsheet formula characters are neutralised; the BOM keeps Arabic readable in Excel.
const safeCell = (value) => (typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

export const reportToCsv = (report) => {
    const table = REPORT_TABLES[report.name];
    return `\uFEFF${toCsv(table.headers, report.rows.map((row) => table.row(row).map(safeCell)))}\r\n`;
};

// ---- "Use it" review queue ----------------------------------------------------------------

export async function listReviews(req, query = {}) {
    const { students } = await resolveReportScope(req, query);
    const filter = { school: req.schoolId, type: 'use_it', student: { $in: students.map((student) => student._id) } };
    filter.status = query.status === 'reviewed' ? { $in: ['accepted', 'needs_work'] } : 'pending';
    const attempts = await VocabAttempt.find(filter).sort({ createdAt: 1 }).limit(200).populate('word', 'word listId').lean();
    const names = new Map(students.map((student) => [String(student._id), `${student.firstName || ''} ${student.lastName || ''}`.trim()]));
    return attempts.map((attempt) => ({
        id: attempt._id,
        student: names.get(String(attempt.student)) || '',
        word: attempt.word?.word || '',
        listId: attempt.listId,
        sentence: attempt.given,
        status: attempt.status,
        teacherComment: attempt.teacherComment,
        createdAt: attempt.createdAt
    }));
}

export async function reviewAttempt(req, attemptId, { status, comment }) {
    if (!['accepted', 'needs_work'].includes(status)) throw httpError('status must be accepted or needs_work', 400);
    const attempt = await VocabAttempt.findOne({ _id: attemptId, school: req.schoolId, type: 'use_it' }).lean().catch(() => null);
    if (!attempt) throw httpError('Sentence not found', 404);
    const { students } = await resolveReportScope(req, {});
    if (!students.some((student) => String(student._id) === String(attempt.student))) throw httpError('You do not have access to that student', 403);
    await VocabAttempt.updateOne({ _id: attempt._id, school: req.schoolId }, {
        $set: { status, teacherComment: String(comment || '').trim().slice(0, 500), reviewedBy: req.user._id, reviewedAt: new Date() }
    });
    return { id: attempt._id, status };
}
