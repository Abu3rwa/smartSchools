import crypto from 'crypto';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SpellingLibraryState from '../models/SpellingLibraryState.js';
import SpellingLibraryMigrationRun from '../models/SpellingLibraryMigrationRun.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingWordProgress from '../models/SpellingWordProgress.js';
import { withTransaction } from '../utils/withTransaction.js';
import { domainError } from '../utils/spellingLibraryErrors.js';
import { hashPayload, canonicalStringify } from '../utils/spellingPreviewToken.js';
import { normalizeForGrading } from '../utils/spellingGrading.js';
import { IMPACT_MAX_STUDENTS } from '../validators/spellingLibraryValidators.js';
import {
    activeWords,
    projectCompletion,
    sortForTraversal
} from './spellingTraversal.js';

const SOURCE_ATTEMPT = 'historical-attempt';
const SOURCE_POSITION = 'legacy-position';
const UNRESOLVED_REPORT_LIMIT = 500;

const idOf = (value) => String(value?._id ?? value);

const studentEntry = (student, grade) => (
    (student.spelling?.progressByGrade || []).find((entry) => entry.grade === grade) || null
);

const projectionOf = (student, grade) => {
    const entry = studentEntry(student, grade);
    const isCurrent = student.spelling?.currentGrade === grade;
    return {
        week: entry?.week ?? null,
        lastWordIndex: Number(entry?.lastWordIndex) || 0,
        placementStartWeek: Number(entry?.placementStartWeek) || 1,
        currentGrade: isCurrent,
        currentWeek: isCurrent ? (student.spelling?.currentWeek ?? null) : null,
        currentLastWordIndex: isCurrent ? (Number(student.spelling?.lastWordIndex) || 0) : 0,
        traversalRevision: Number(student.spelling?.traversalRevision) || 0
    };
};

const withinPointer = (word, pointerWeek, pointerIndex) => (
    Number.isInteger(pointerWeek)
    && (word.week < pointerWeek
        || (word.week === pointerWeek && word.order <= pointerIndex))
);

/**
 * Pure migration plan. Consumption is reconstructed in this order:
 *  1. ledger rows already written (they win, including rows from a prior run),
 *  2. historical session attempts for the grade (truth for who consumed what),
 *  3. the legacy week/lastWordIndex pointer only when no attempt history exists.
 * A pointer alone cannot reveal insertions below it, so it is the last resort.
 */
export const buildMigrationPlan = ({ grade, words = [], students = [], progressRows = [], attempts = [] }) => {
    const wordsById = new Map(words.map((word) => [idOf(word), word]));
    const active = sortForTraversal(activeWords(words));
    const bySnapshot = new Map();
    for (const word of words) {
        const normalized = word.normalizedWord || normalizeForGrading(word.word);
        if (!normalized) continue;
        const key = `${Number(word.week)}:${normalized}`;
        if (!bySnapshot.has(key)) bySnapshot.set(key, []);
        bySnapshot.get(key).push(word);
    }

    const ledgerByStudent = new Map();
    const existingWordIdsByStudent = new Map();
    for (const row of progressRows) {
        const key = idOf(row.student);
        if (!ledgerByStudent.has(key)) {
            ledgerByStudent.set(key, new Map());
            existingWordIdsByStudent.set(key, new Set());
        }
        ledgerByStudent.get(key).set(idOf(row.wordId), row.migrationRunId ? String(row.migrationRunId) : null);
        existingWordIdsByStudent.get(key).add(idOf(row.wordId));
    }

    const attemptsByStudent = new Map();
    for (const attempt of attempts) {
        if (attempt.isRetest || attempt.grade !== grade || !attempt.wordId) continue;
        const key = idOf(attempt.student);
        if (!attemptsByStudent.has(key)) attemptsByStudent.set(key, []);
        attemptsByStudent.get(key).push(attempt);
    }

    const entries = [];
    const unresolved = [];
    const counts = {
        students: students.length,
        existingLedger: 0,
        fromAttempts: 0,
        fromPosition: 0,
        danglingResolved: 0,
        danglingUnresolved: 0,
        projectionsChanged: 0
    };
    let totalWords = 0;

    for (const student of students) {
        const key = idOf(student._id);
        const consumed = new Map();
        const sources = new Map();
        for (const wordId of existingWordIdsByStudent.get(key) || []) {
            consumed.set(wordId, true);
            sources.set(wordId, 'existing');
            counts.existingLedger += 1;
        }

        const studentAttempts = attemptsByStudent.get(key) || [];
        if (studentAttempts.length) {
            for (const attempt of studentAttempts) {
                let wordId = idOf(attempt.wordId);
                if (!wordsById.has(wordId) || wordsById.get(wordId).grade !== grade) {
                    const normalized = normalizeForGrading(attempt.wordSnapshot || '');
                    const candidates = (bySnapshot.get(`${Number(attempt.week)}:${normalized}`) || [])
                        .filter((word) => word.grade === grade);
                    const activeCandidates = candidates.filter((word) => !word.deletedAt);
                    const resolved = activeCandidates.length === 1
                        ? activeCandidates[0]
                        : (candidates.length === 1 ? candidates[0] : null);
                    if (!resolved) {
                        counts.danglingUnresolved += 1;
                        unresolved.push({
                            student: student._id,
                            wordId: mongoose.Types.ObjectId.isValid(wordId) ? attempt.wordId : null,
                            reason: normalized
                                ? 'Snapshot matches no single word'
                                : 'Attempt has no canonical snapshot'
                        });
                        continue;
                    }
                    wordId = idOf(resolved);
                    counts.danglingResolved += 1;
                    consumed.set(wordId, true);
                    if (!sources.has(wordId)) {
                        sources.set(wordId, SOURCE_ATTEMPT);
                        counts.fromAttempts += 1;
                    }
                    continue;
                }
                if (!consumed.has(wordId)) {
                    consumed.set(wordId, true);
                    sources.set(wordId, SOURCE_ATTEMPT);
                    counts.fromAttempts += 1;
                }
            }
        } else if (consumed.size === 0) {
            const entry = studentEntry(student, grade);
            const pointerWeek = entry?.week ?? (
                student.spelling?.currentGrade === grade ? student.spelling?.currentWeek : null
            );
            const pointerIndex = Number(
                entry?.lastWordIndex ?? (
                    student.spelling?.currentGrade === grade ? student.spelling?.lastWordIndex : 0
                )
            ) || 0;
            if (pointerWeek) {
                for (const word of active) {
                    if (!withinPointer(word, Number(pointerWeek), pointerIndex)) continue;
                    if (!consumed.has(idOf(word))) {
                        consumed.set(idOf(word), true);
                        sources.set(idOf(word), SOURCE_POSITION);
                        counts.fromPosition += 1;
                    }
                }
            }
        }

        const before = projectionOf(student, grade);
        const projection = projectCompletion({
            words: active,
            consumedIds: new Set(consumed.keys()),
            floorWeek: before.placementStartWeek
        });
        const projectedWeek = active.length ? (projection.week || 1) : before.week;
        const projectedIndex = active.length ? projection.lastWordIndex : before.lastWordIndex;
        const after = {
            week: projectedWeek,
            lastWordIndex: projectedIndex,
            placementStartWeek: before.placementStartWeek,
            currentGrade: before.currentGrade,
            currentWeek: before.currentGrade ? projectedWeek : before.currentWeek,
            currentLastWordIndex: before.currentGrade ? projectedIndex : before.currentLastWordIndex,
            traversalRevision: before.traversalRevision + 1
        };
        if (canonicalStringify({ ...before, traversalRevision: 0 }) !== canonicalStringify({ ...after, traversalRevision: 0 })) {
            counts.projectionsChanged += 1;
        }

        const consumedIds = [...consumed.keys()].sort();
        totalWords += consumedIds.length;
        entries.push({
            student: student._id,
            studentKey: key,
            consumedIds,
            sources,
            before,
            after
        });
    }

    return {
        grade,
        entries,
        unresolved,
        counts,
        totalWords,
        digest: hashPayload(entries.map((entry) => ({
            student: entry.studentKey,
            consumed: entry.consumedIds,
            before: entry.before,
            after: entry.after
        })))
    };
};

const loadMigrationInput = async ({ schoolId, grade }) => {
    const [students, words, progressRows, sessions] = await Promise.all([
        Student.find({
            school: schoolId,
            $or: [
                { 'spelling.progressByGrade.grade': grade },
                { 'spelling.currentGrade': grade }
            ]
        }).select('_id spelling').limit(IMPACT_MAX_STUDENTS + 1).lean(),
        SpellingWord.find({ school: schoolId, grade })
            .select('grade week order word normalizedWord deletedAt')
            .lean(),
        SpellingWordProgress.find({ school: schoolId, grade })
            .select('student wordId migrationRunId')
            .lean(),
        SpellingSession.find({ school: schoolId, 'attempts.grade': grade })
            .select('student attempts.grade attempts.wordId attempts.wordSnapshot attempts.week attempts.isRetest')
            .lean()
    ]);
    if (students.length > IMPACT_MAX_STUDENTS) throw domainError('MIGRATION_BLOCKED');
    const attempts = [];
    for (const session of sessions) {
        for (const attempt of session.attempts || []) {
            if (attempt.grade !== grade) continue;
            attempts.push({ ...attempt, student: session.student });
        }
    }
    return { students, words, progressRows, attempts };
};

const findActiveRun = async ({ schoolId, grade }) => SpellingLibraryMigrationRun.findOne({
    school: schoolId,
    grade,
    status: 'applying'
}).sort({ startedAt: -1 }).lean();

const runEntries = (plan) => plan.entries.map((entry) => ({
    student: entry.student,
    ledgerHash: hashPayload([...entry.consumedIds]),
    ledgerCount: entry.consumedIds.length,
    insertedWordIds: [],
    before: entry.before,
    after: entry.after,
    appliedAt: null
}));

const ensureBlockedState = async ({ schoolId, grade, actorId }) => SpellingLibraryState.findOneAndUpdate(
    { school: schoolId, grade },
    {
        $set: {
            migrationStatus: 'blocked',
            ...(actorId ? { updatedBy: actorId } : {})
        },
        $setOnInsert: {
            school: schoolId,
            grade,
            version: 1,
            coordinationRevision: 0,
            progressSchemaVersion: 0
        }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
);

const applyStudentEntry = async ({ schoolId, grade, runId, entry, words, counts }) => withTransaction(async (dbSession) => {
    const existingRows = await SpellingWordProgress.find({
        school: schoolId,
        student: entry.student
    }).select('wordId migrationRunId').session(dbSession).lean();
    const rowByWord = new Map(existingRows.map((row) => [idOf(row.wordId), row]));

    const inserts = [];
    const ownedIds = [];
    for (const wordId of entry.consumedIds) {
        const row = rowByWord.get(wordId);
        if (!row) {
            inserts.push({
                school: schoolId,
                student: entry.student,
                wordId,
                grade,
                consumedAt: new Date(),
                source: entry.sources.get(wordId) || SOURCE_ATTEMPT,
                migrationRunId: runId
            });
            ownedIds.push(wordId);
        } else if (row.migrationRunId === runId) {
            ownedIds.push(wordId);
        }
    }
    if (inserts.length) {
        await SpellingWordProgress.insertMany(inserts, { session: dbSession, ordered: true });
    }

    const active = sortForTraversal(activeWords(words));
    const consumedIds = new Set(entry.consumedIds);
    const projection = projectCompletion({
        words: active,
        consumedIds,
        floorWeek: entry.before.placementStartWeek
    });
    const projectedWeek = active.length ? (projection.week || 1) : entry.before.week;
    const projectedIndex = active.length ? projection.lastWordIndex : entry.before.lastWordIndex;

    const target = await Student.findOne({ _id: entry.student, school: schoolId })
        .select('spelling')
        .session(dbSession)
        .lean();
    if (!target) throw domainError('MIGRATION_CONFLICT');
    const entryFilter = {
        _id: entry.student,
        school: schoolId,
        'spelling.progressByGrade.grade': grade
    };
    const entryUpdate = {
        $set: {
            'spelling.progressByGrade.$.week': projectedWeek,
            'spelling.progressByGrade.$.lastWordIndex': projectedIndex || 0,
            'spelling.progressByGrade.$.placementStartWeek': entry.before.placementStartWeek
        }
    };
    const updated = await Student.updateOne(entryFilter, entryUpdate, { session: dbSession });
    if (updated.matchedCount === 0) {
        await Student.updateOne(
            { _id: entry.student, school: schoolId },
            {
                $push: {
                    'spelling.progressByGrade': {
                        grade,
                        week: projectedWeek || 1,
                        lastWordIndex: projectedIndex || 0,
                        placementStartWeek: entry.before.placementStartWeek
                    }
                }
            },
            { session: dbSession }
        );
    }
    if (target.spelling?.currentGrade === grade) {
        await Student.updateOne(
            { _id: entry.student, school: schoolId, 'spelling.currentGrade': grade },
            {
                $set: {
                    'spelling.currentWeek': projectedWeek || 1,
                    'spelling.lastWordIndex': projectedIndex || 0,
                    'spelling.traversalRevision': entry.after.traversalRevision
                }
            },
            { session: dbSession }
        );
    } else {
        await Student.updateOne(
            { _id: entry.student, school: schoolId },
            { $set: { 'spelling.traversalRevision': entry.after.traversalRevision } },
            { session: dbSession }
        );
    }

    counts.ledgerInserted = (counts.ledgerInserted || 0) + inserts.length;
    counts.ledgerOwned = (counts.ledgerOwned || 0) + ownedIds.length;
    await SpellingLibraryMigrationRun.updateOne(
        { school: schoolId, grade, runId, 'entries.student': entry.student },
        {
            $set: {
                'entries.$.appliedAt': new Date(),
                'entries.$.insertedWordIds': ownedIds,
                'entries.$.ledgerHash': hashPayload([...ownedIds].sort()),
                'entries.$.ledgerCount': ownedIds.length
            }
        },
        { session: dbSession }
    );
    return { student: entry.student, ownedIds };
});

export const runMigration = async ({
    schoolId,
    grade,
    mode = 'dry-run',
    runId = null,
    actorId = null
}) => {
    if (!mongoose.Types.ObjectId.isValid(schoolId)) throw domainError('INVALID_ID');
    if (!['KG', 'G1', 'G2', 'G3', 'G4', 'G5'].includes(grade)) throw domainError('INVALID_FILTER');
    if (!['dry-run', 'apply', 'verify', 'rollback'].includes(mode)) throw domainError('INVALID_REQUEST');

    const { students, words, progressRows, attempts } = await loadMigrationInput({ schoolId, grade });
    const plan = buildMigrationPlan({ grade, words, students, progressRows, attempts });

    if (mode === 'dry-run') {
        const existing = runId
            ? await SpellingLibraryMigrationRun.findOne({ school: schoolId, grade, runId })
            : null;
        if (existing?.status === 'applied') throw domainError('MIGRATION_CONFLICT');
        if (existing) {
            existing.status = 'dry-run';
            existing.planDigest = plan.digest;
            existing.counts = plan.counts;
            existing.unresolved = plan.unresolved.slice(0, UNRESOLVED_REPORT_LIMIT);
            existing.finishedAt = new Date();
            await existing.save();
            return { runId: existing.runId, mode, status: 'dry-run', ...planSummary(plan), stateChanged: false };
        }
        const [created] = await SpellingLibraryMigrationRun.create([{
            school: schoolId,
            grade,
            runId: runId || crypto.randomUUID(),
            status: 'dry-run',
            planDigest: plan.digest,
            counts: plan.counts,
            entries: runEntries(plan),
            unresolved: plan.unresolved.slice(0, UNRESOLVED_REPORT_LIMIT),
            appliedBy: actorId,
            finishedAt: new Date()
        }]);
        return { runId: created.runId, mode, status: 'dry-run', ...planSummary(plan), stateChanged: false };
    }

    if (mode === 'apply') {
        if (plan.unresolved.length) {
            const [created] = await SpellingLibraryMigrationRun.create([{
                school: schoolId,
                grade,
                runId: runId || crypto.randomUUID(),
                status: 'blocked',
                planDigest: plan.digest,
                counts: plan.counts,
                entries: [],
                unresolved: plan.unresolved.slice(0, UNRESOLVED_REPORT_LIMIT),
                appliedBy: actorId,
                finishedAt: new Date()
            }]);
            await ensureBlockedState({ schoolId, grade, actorId });
            return { runId: created.runId, mode, status: 'blocked', ...planSummary(plan), stateChanged: true };
        }
        let run = runId
            ? await SpellingLibraryMigrationRun.findOne({ school: schoolId, grade, runId })
            : null;
        if (run?.status === 'applied') {
            return { runId: run.runId, mode, ...summaryFromRun(run), idempotent: true, stateChanged: true };
        }
        if (!run) {
            const active = await findActiveRun({ schoolId, grade });
            if (active && active.runId !== runId) throw domainError('MIGRATION_CONFLICT');
            [run] = await SpellingLibraryMigrationRun.create([{
                school: schoolId,
                grade,
                runId: runId || crypto.randomUUID(),
                status: 'applying',
                planDigest: plan.digest,
                counts: plan.counts,
                entries: runEntries(plan),
                unresolved: [],
                appliedBy: actorId
            }]);
        } else {
            run.planDigest = plan.digest;
            run.counts = plan.counts;
            run.status = 'applying';
            await run.save();
        }

        await ensureBlockedState({ schoolId, grade, actorId });
        const counts = { ledgerInserted: 0, ledgerOwned: 0 };
        for (const entry of plan.entries) {
            const stored = run.entries.find((item) => idOf(item.student) === entry.studentKey);
            if (stored?.appliedAt) continue;
            await applyStudentEntry({ schoolId, grade, runId: run.runId, entry, words, counts });
        }

        const blocked = plan.unresolved.length > 0;
        await withTransaction(async (dbSession) => {
            const state = await SpellingLibraryState.findOne({
                school: schoolId,
                grade
            }).session(dbSession);
            if (!state) throw domainError('MIGRATION_CONFLICT');
            state.migrationStatus = blocked ? 'blocked' : 'ready';
            state.progressSchemaVersion = blocked ? 0 : 1;
            if (actorId) state.updatedBy = actorId;
            await state.save({ session: dbSession });
            await SpellingLibraryMigrationRun.updateOne(
                { school: schoolId, grade, runId: run.runId },
                {
                    $set: {
                        status: blocked ? 'blocked' : 'applied',
                        planDigest: plan.digest,
                        counts: { ...plan.counts, ...counts },
                        finishedAt: new Date()
                    }
                },
                { session: dbSession }
            );
        });
        const refreshed = await SpellingLibraryMigrationRun.findOne({ school: schoolId, grade, runId: run.runId }).lean();
        return { runId: run.runId, mode, ...summaryFromRun(refreshed), stateChanged: true };
    }

    const target = runId
        ? await SpellingLibraryMigrationRun.findOne({ school: schoolId, grade, runId })
        : await SpellingLibraryMigrationRun.findOne({ school: schoolId, grade, status: { $in: ['applied', 'failed'] } })
            .sort({ startedAt: -1 });
    if (!target) throw domainError('MIGRATION_CONFLICT');

    if (mode === 'verify') {
        return verifyRun({ schoolId, grade, run: target });
    }
    return rollbackRun({ schoolId, grade, run: target, actorId });
};

const planSummary = (plan) => ({
    planDigest: plan.digest,
    counts: plan.counts,
    totalWords: plan.totalWords,
    unresolved: plan.unresolved.slice(0, 50).map((item) => ({
        student: idOf(item.student),
        wordId: item.wordId ? idOf(item.wordId) : null,
        reason: item.reason
    })),
    unresolvedCount: plan.unresolved.length
});

const summaryFromRun = (run) => ({
    status: run.status,
    planDigest: run.planDigest,
    counts: run.counts,
    totalWords: run.entries.reduce((sum, entry) => sum + (Number(entry.ledgerCount) || 0), 0),
    unresolvedCount: run.unresolved?.length || 0,
    appliedStudents: run.entries.filter((entry) => entry.appliedAt).length
});

const runLedgerRows = async ({ schoolId, runId }) => SpellingWordProgress.find({
    school: schoolId,
    migrationRunId: runId
}).select('student wordId').lean();

const verifyRun = async ({ schoolId, grade, run }) => {
    const rows = await runLedgerRows({ schoolId, runId: run.runId });
    const byStudent = new Map();
    for (const row of rows) {
        const key = idOf(row.student);
        if (!byStudent.has(key)) byStudent.set(key, []);
        byStudent.get(key).push(idOf(row.wordId));
    }
    const mismatches = [];
    for (const entry of run.entries) {
        if (!entry.appliedAt) {
            mismatches.push({ student: idOf(entry.student), reason: 'Entry was never applied' });
            continue;
        }
        const ids = (byStudent.get(idOf(entry.student)) || []).sort();
        if (ids.length !== entry.ledgerCount || hashPayload(ids) !== entry.ledgerHash) {
            mismatches.push({ student: idOf(entry.student), reason: 'Ledger rows no longer match the manifest' });
        }
    }
    const state = await SpellingLibraryState.findOne({ school: schoolId, grade }).lean();
    const ready = run.status === 'applied'
        && mismatches.length === 0
        && state?.migrationStatus === 'ready'
        && Number(state?.progressSchemaVersion) >= 1;
    return {
        runId: run.runId,
        mode: 'verify',
        status: run.status,
        ready,
        mismatches,
        counts: run.counts,
        ledgerRows: rows.length
    };
};

const rowFields = (student, grade) => {
    const entry = studentEntry(student, grade);
    return {
        week: entry?.week ?? null,
        lastWordIndex: Number(entry?.lastWordIndex) || 0,
        traversalRevision: Number(student.spelling?.traversalRevision) || 0
    };
};

const rollbackRun = async ({ schoolId, grade, run, actorId }) => {
    if (!['applied', 'failed', 'blocked'].includes(run.status)) throw domainError('MIGRATION_CONFLICT');
    const students = await Student.find({
        _id: { $in: run.entries.map((entry) => entry.student) },
        school: schoolId
    }).select('_id spelling').lean();
    const studentsById = new Map(students.map((student) => [idOf(student._id), student]));
    const rows = await runLedgerRows({ schoolId, runId: run.runId });
    const byStudent = new Map();
    for (const row of rows) {
        const key = idOf(row.student);
        if (!byStudent.has(key)) byStudent.set(key, []);
        byStudent.get(key).push(idOf(row.wordId));
    }

    const conflicts = [];
    const restorable = [];
    for (const entry of run.entries) {
        const student = studentsById.get(idOf(entry.student));
        if (!student) {
            conflicts.push({ student: idOf(entry.student), reason: 'Student is no longer in this school' });
            continue;
        }
        const current = rowFields(student, grade);
        const ids = (byStudent.get(idOf(entry.student)) || []).sort();
        if (ids.length !== entry.ledgerCount || hashPayload(ids) !== entry.ledgerHash) {
            conflicts.push({ student: idOf(entry.student), reason: 'Ledger advanced or was edited after migration' });
            continue;
        }
        if (current.week !== entry.after.week
            || current.lastWordIndex !== entry.after.lastWordIndex
            || current.traversalRevision !== entry.after.traversalRevision) {
            conflicts.push({ student: idOf(entry.student), reason: 'Student progress advanced after migration' });
            continue;
        }
        restorable.push({ entry, student });
    }

    if (conflicts.length) {
        return {
            runId: run.runId,
            mode: 'rollback',
            rolledBack: false,
            conflicts,
            counts: run.counts
        };
    }

    for (const { entry, student } of restorable) {
        await withTransaction(async (dbSession) => {
            await SpellingWordProgress.deleteMany(
                { school: schoolId, student: entry.student, migrationRunId: run.runId },
                { session: dbSession }
            );
            if (entry.before.week === null) {
                await Student.updateOne(
                    { _id: entry.student, school: schoolId },
                    {
                        $pull: { 'spelling.progressByGrade': { grade } },
                        $set: {
                            ...(student.spelling?.currentGrade === grade
                                ? {
                                    'spelling.currentWeek': entry.before.currentWeek,
                                    'spelling.lastWordIndex': entry.before.currentLastWordIndex
                                }
                                : {}),
                            'spelling.traversalRevision': entry.before.traversalRevision
                        }
                    },
                    { session: dbSession }
                );
            } else {
                await Student.updateOne(
                    {
                        _id: entry.student,
                        school: schoolId,
                        'spelling.progressByGrade.grade': grade
                    },
                    {
                        $set: {
                            'spelling.progressByGrade.$.week': entry.before.week,
                            'spelling.progressByGrade.$.lastWordIndex': entry.before.lastWordIndex,
                            'spelling.progressByGrade.$.traversalRevision': entry.before.traversalRevision,
                            ...(student.spelling?.currentGrade === grade
                                ? {
                                    'spelling.currentWeek': entry.before.currentWeek,
                                    'spelling.lastWordIndex': entry.before.currentLastWordIndex
                                }
                                : {}),
                            'spelling.traversalRevision': entry.before.traversalRevision
                        }
                    },
                    { session: dbSession }
                );
            }
        });
    }

    await withTransaction(async (dbSession) => {
        const state = await SpellingLibraryState.findOne({ school: schoolId, grade }).session(dbSession);
        if (state) {
            // A blocked run still needs the grade to stay blocked: unresolved
            // identities were never written and structure must not proceed.
            state.migrationStatus = run.status === 'blocked' ? 'blocked' : 'ready';
            state.progressSchemaVersion = 0;
            if (actorId) state.updatedBy = actorId;
            await state.save({ session: dbSession });
        }
        await SpellingLibraryMigrationRun.updateOne(
            { school: schoolId, grade, runId: run.runId },
            { $set: { status: 'rolled-back', finishedAt: new Date() } },
            { session: dbSession }
        );
    });
    return {
        runId: run.runId,
        mode: 'rollback',
        rolledBack: true,
        conflicts: [],
        counts: run.counts
    };
};
