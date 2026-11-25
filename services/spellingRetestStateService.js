import SpellingRetestEvent from '../models/SpellingRetestEvent.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import { domainError } from '../utils/spellingLibraryErrors.js';

export const RETEST_POLICY_VERSION = 1;

const STATE_FIELDS = [
    // The session's typed attempt snapshot requires the revision it recorded.
    'revision',
    'status',
    'correctRetestStreak',
    'incorrectRetestCount',
    'dueAt',
    'lastRetestedAt',
    'practiceMasteredAt',
    'practiceMasteredBySession',
    'resolvedAt',
    'resolvedBySession',
    'suppressedAt',
    'wordSnapshot',
    'wordRevision'
];

/**
 * Typed copy of the retest fields an event records. Keeping one snapshot shape
 * means a later replay compares like with like.
 */
export const snapshotRetestState = (item) => {
    if (!item) return null;
    const state = {};
    for (const field of STATE_FIELDS) state[field] = item[field] ?? null;
    return state;
};

export const applyRetestAnswerPolicy = ({ item, correct, skipped, formalTest, at, sessionId }) => {
    if (!item || skipped) return null;
    if (formalTest && correct) {
        return {
            status: 'resolved',
            resolvedAt: at,
            resolvedBySession: sessionId,
            practiceMasteredAt: null,
            practiceMasteredBySession: null
        };
    }
    if (formalTest) {
        return {
            status: 'pending',
            practiceMasteredAt: null,
            practiceMasteredBySession: null,
            correctRetestStreak: 0,
            incorrectRetestCount: (Number(item.incorrectRetestCount) || 0) + 1
        };
    }
    if (correct) {
        const streak = (Number(item.correctRetestStreak) || 0) + 1;
        return {
            correctRetestStreak: streak,
            ...(streak >= 3
                ? { status: 'practice-mastered', practiceMasteredAt: at, practiceMasteredBySession: sessionId }
                : {})
        };
    }
    return {
        correctRetestStreak: 0,
        incorrectRetestCount: (Number(item.incorrectRetestCount) || 0) + 1
    };
};

const nextSequence = async ({ schoolId, studentId, sourceWord, dbSession }) => {
    const previous = await SpellingRetestEvent.findOne({
        school: schoolId,
        student: studentId,
        sourceWord
    })
        .sort({ sequence: -1 })
        .select('sequence')
        .session(dbSession)
        .lean();
    return (previous?.sequence || 0) + 1;
};

export const recordRetestEvent = async ({
    schoolId,
    studentId,
    sourceWord,
    kind,
    outcome = null,
    before = null,
    after = null,
    retestItemIds = [],
    sourceSession = null,
    sourceAttempt = null,
    operationId = null,
    occurredAt = new Date(),
    dbSession
}) => {
    const sequence = await nextSequence({ schoolId, studentId, sourceWord, dbSession });
    return SpellingRetestEvent.create([{
        school: schoolId,
        student: studentId,
        sourceWord,
        sequence,
        kind,
        outcome,
        before,
        after,
        retestItemIds,
        sourceSession,
        sourceAttempt,
        operationId,
        policyVersion: RETEST_POLICY_VERSION,
        occurredAt
    }], { session: dbSession }).then(([event]) => event);
};

/**
 * Applies the existing retest policies for a single answered item and records
 * the real lifecycle event beside the write. `sourceAttempt` is the attempt
 * that produced this answer (not the attempt that created the obligation), so
 * a later correction can replay exactly this event.
 */
export const recordRetestAnswer = async ({
    schoolId,
    studentId,
    retestItemId,
    correct,
    skipped,
    sessionId,
    sourceAttempt = null,
    formalTest = false,
    at,
    dbSession
}) => {
    if (!retestItemId || skipped) return [];
    const retestItem = await SpellingRetestItem.findOne({
        _id: retestItemId,
        school: schoolId,
        student: studentId,
        status: { $in: ['pending', 'practice-mastered'] }
    }).session(dbSession);
    if (!retestItem) return [];

    const outcome = { correct: Boolean(correct), skipped: false, formalTest: Boolean(formalTest) };

    if (formalTest && correct) {
        const items = await SpellingRetestItem.find({
            school: schoolId,
            student: studentId,
            sourceWord: retestItem.sourceWord,
            status: { $in: ['pending', 'practice-mastered'] }
        }).session(dbSession);
        const touched = [];
        for (const item of items) {
            const before = snapshotRetestState(item);
            Object.assign(item, applyRetestAnswerPolicy({
                item,
                correct: true,
                skipped: false,
                formalTest: true,
                at,
                sessionId
            }));
            item.revision += 1;
            const after = snapshotRetestState(item);
            const sequence = await nextSequence({
                schoolId,
                studentId,
                sourceWord: item.sourceWord,
                dbSession
            });
            item.lastEventSequence = sequence;
            await SpellingRetestEvent.create([{
                school: schoolId,
                student: studentId,
                sourceWord: item.sourceWord,
                sequence,
                kind: 'answer',
                outcome,
                before,
                after,
                retestItemIds: [item._id],
                sourceSession: sessionId,
                sourceAttempt,
                policyVersion: RETEST_POLICY_VERSION,
                occurredAt: at
            }], { session: dbSession });
            await item.save({ session: dbSession });
            touched.push({ retestItemId: item._id, before, after });
        }
        return touched;
    }

    const before = snapshotRetestState(retestItem);
    Object.assign(retestItem, applyRetestAnswerPolicy({
        item: retestItem,
        correct,
        skipped,
        formalTest,
        at,
        sessionId
    }));
    retestItem.revision += 1;
    const event = await recordRetestEvent({
        schoolId,
        studentId,
        sourceWord: retestItem.sourceWord,
        kind: 'answer',
        outcome,
        before,
        after: snapshotRetestState(retestItem),
        retestItemIds: [retestItem._id],
        sourceSession: sessionId,
        sourceAttempt,
        occurredAt: at,
        dbSession
    });
    retestItem.lastEventSequence = event.sequence;
    await retestItem.save({ session: dbSession });
    return [{
        retestItemId: retestItem._id,
        before,
        after: snapshotRetestState(retestItem)
    }];
};

/**
 * Renames outstanding obligations so a typo correction never leaves stale text.
 * The mastery identity stays on the same source word; streaks, status, due dates
 * and attempts are untouched. Combining two pending words rejects.
 */
export const propagateRetestTypo = async ({
    schoolId,
    wordId,
    newText,
    newRevision,
    operationId,
    at = new Date(),
    dbSession
}) => {
    const items = await SpellingRetestItem.find({
        school: schoolId,
        sourceWord: wordId,
        status: { $in: ['pending', 'practice-mastered'] },
        suppressedAt: null
    }).session(dbSession);
    if (items.length === 0) return { updated: 0, retestItemIds: [] };

    for (const item of items) {
        const collision = await SpellingRetestItem.findOne({
            school: schoolId,
            student: item.student,
            status: 'pending',
            suppressedAt: null,
            wordSnapshot: newText,
            sourceWord: { $ne: wordId }
        }).select('_id').session(dbSession).lean();
        if (collision) throw domainError('RETEST_TEXT_COLLISION');
    }

    for (const item of items) {
        const before = snapshotRetestState(item);
        item.wordSnapshot = newText;
        item.wordRevision = newRevision;
        item.revision += 1;
        await recordRetestEvent({
            schoolId,
            studentId: item.student,
            sourceWord: wordId,
            kind: 'typo',
            before,
            after: snapshotRetestState(item),
            retestItemIds: [item._id],
            operationId,
            occurredAt: at,
            dbSession
        });
        await item.save({ session: dbSession });
    }
    return { updated: items.length, retestItemIds: items.map((item) => item._id) };
};

export const suppressRetestObligation = async ({
    schoolId,
    studentId,
    retestItemId,
    operationId,
    at = new Date(),
    dbSession
}) => {
    const item = await SpellingRetestItem.findOne({
        _id: retestItemId,
        school: schoolId,
        student: studentId,
        status: 'pending',
        suppressedAt: null
    }).session(dbSession);
    if (!item) return null;
    const before = snapshotRetestState(item);
    item.suppressedAt = at;
    item.suppressedByCorrection = operationId || null;
    item.revision += 1;
    await recordRetestEvent({
        schoolId,
        studentId,
        sourceWord: item.sourceWord,
        kind: 'teacher-override',
        before,
        after: snapshotRetestState(item),
        retestItemIds: [item._id],
        operationId,
        occurredAt: at,
        dbSession
    });
    await item.save({ session: dbSession });
    return item;
};

/**
 * Creates the pending obligation for a missed original answer. The unique
 * pending/snapshot index keeps a repeated attempt from duplicating the row; a
 * new row records the baseline event a later correction replays from.
 */
export const createRetestObligation = async ({
    schoolId,
    studentId,
    session,
    attempt,
    item,
    at,
    sourceAttempt = null,
    operationId = null,
    dbSession
}) => {
    const existing = await SpellingRetestItem.findOne({
        school: schoolId,
        student: studentId,
        wordSnapshot: item.word,
        status: 'pending',
        suppressedAt: null
    }).session(dbSession);
    if (existing) return { item: existing, created: false };

    const [created] = await SpellingRetestItem.create([{
        school: schoolId,
        student: studentId,
        sourceWord: item.wordId,
        wordSnapshot: item.word,
        grade: item.grade,
        week: item.week,
        category: item.category,
        sourceSession: session._id,
        sourceAttempt: attempt._id,
        flaggedAt: at,
        dueAt: session.retestDeadline,
        status: 'pending',
        wordRevision: item.wordRevision || 1
    }], { session: dbSession });

    const after = snapshotRetestState(created);
    await recordRetestEvent({
        schoolId,
        studentId,
        sourceWord: item.wordId,
        kind: 'baseline',
        outcome: {
            correct: false,
            skipped: false,
            formalTest: session.assessmentType === 'formal-spelling-test'
        },
        before: null,
        after,
        retestItemIds: [created._id],
        sourceSession: session._id,
        sourceAttempt: sourceAttempt || attempt._id,
        operationId,
        occurredAt: at,
        dbSession
    });
    return { item: created, created: true };
};
