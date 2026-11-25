import SpellingRetestEvent from '../models/SpellingRetestEvent.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import { withTransaction } from '../utils/withTransaction.js';
import { domainError } from '../utils/spellingLibraryErrors.js';
import {
    createRetestObligation,
    recordRetestEvent,
    snapshotRetestState
} from './spellingRetestStateService.js';
import {
    compareRetestStates,
    replayRetestGroup,
    REPLAYED_STATE_FIELDS
} from './spellingRetestReplay.js';
import {
    saveFormalSpellingGradebookEntry
} from './spellingSessionService.js';

export const CORRECTION_POLICY_VERSION = 1;
const MAX_CORRECTION_HISTORY = 1000;
const MAX_LIFECYCLE_EVENTS = 5000;
const OPEN_STATUSES = ['pending', 'practice-mastered'];

const actionResult = ({ session, attempt, gradebookSynced = false, idempotent = true }) => ({
    session,
    attempt,
    gradebookSynced,
    revision: attempt.revision,
    idempotent
});

const countEffectiveTotals = (session) => {
    let correctCount = 0;
    let mistakeCount = 0;
    for (const attempt of session.attempts) {
        const correct = attempt.correct === true;
        const skipped = !correct && (
            attempt.skipped === true
            || (session.mode === 'self-serve'
                && attempt.skipped === undefined
                && !String(attempt.studentInput ?? '').trim())
        );
        if (correct) correctCount += 1;
        else if (!skipped) mistakeCount += 1;
    }
    return { correctCount, mistakeCount };
};

const priorCorrectionOperationIds = (attempt) => {
    const ids = new Set();
    for (const entry of attempt.correctionHistory || []) {
        if (entry.operationId) ids.add(entry.operationId);
    }
    return ids;
};

const assertNotPinnedElsewhere = async ({ schoolId, session, retestItemIds, dbSession }) => {
    if (!retestItemIds.length) return;
    const pinned = await SpellingSession.findOne({
        _id: { $ne: session._id },
        school: schoolId,
        status: { $in: ['in-progress', 'scheduled'] },
        $or: [
            { 'formalTestWordList.retestItemId': { $in: retestItemIds } },
            { retestQuizItems: { $in: retestItemIds } }
        ]
    })
        .select('_id')
        .session(dbSession)
        .lean();
    if (pinned) throw domainError('CORRECTION_BLOCKED');
};

const writeRetestTransition = async ({
    schoolId,
    session,
    attempt,
    row,
    before,
    operationId,
    outcome,
    at,
    dbSession
}) => {
    const after = snapshotRetestState(row);
    const event = await recordRetestEvent({
        schoolId,
        studentId: session.student,
        sourceWord: row.sourceWord,
        kind: 'teacher-override',
        outcome,
        before,
        after,
        retestItemIds: [row._id],
        sourceSession: session._id,
        sourceAttempt: attempt._id,
        operationId,
        occurredAt: at,
        dbSession
    });
    if (Number.isInteger(event?.sequence)) {
        row.lastEventSequence = event.sequence;
    }
    row.revision = (Number(row.revision) || 1) + 1;
    await row.save({ session: dbSession });
};

/**
 * Keeps the originating obligation in step with a non-retest attempt's effective
 * result. Only rows whose baseline came from this attempt are touched.
 */
const applyOriginatingOutcome = async ({
    schoolId,
    session,
    attempt,
    newCorrect,
    operationId,
    at,
    dbSession
}) => {
    const rows = await SpellingRetestItem.find({
        school: schoolId,
        student: session.student,
        sourceWord: attempt.wordId,
        sourceAttempt: attempt._id
    }).session(dbSession);
    const correctionOperationIds = priorCorrectionOperationIds(attempt);
    const formalOrigin = session.assessmentType === 'formal-spelling-test';
    const outcome = {
        correct: newCorrect,
        skipped: false,
        formalTest: formalOrigin
    };
    const touched = [];
    const transitions = [];

    for (const row of rows) {
        const before = snapshotRetestState(row);
        const target = { suppressedAt: row.suppressedAt, suppressedByCorrection: row.suppressedByCorrection };
        target.status = row.status;
        target.practiceMasteredAt = row.practiceMasteredAt;
        target.practiceMasteredBySession = row.practiceMasteredBySession;

        if (newCorrect) {
            if (formalOrigin) {
                if (!row.suppressedAt && OPEN_STATUSES.includes(row.status)) {
                    target.suppressedAt = at;
                    target.suppressedByCorrection = operationId;
                }
            } else if (row.status === 'pending' && !row.suppressedAt) {
                target.status = 'practice-mastered';
                target.practiceMasteredAt = at;
                target.practiceMasteredBySession = session._id;
            }
        } else if (row.suppressedAt) {
            if (correctionOperationIds.has(String(row.suppressedByCorrection))) {
                target.suppressedAt = null;
                target.suppressedByCorrection = null;
            }
        } else if (
            row.status === 'practice-mastered'
            && String(row.practiceMasteredBySession) === String(session._id)
        ) {
            target.status = 'pending';
            target.practiceMasteredAt = null;
            target.practiceMasteredBySession = null;
        }

        const after = { ...before, ...target };
        if (compareRetestStates(before, after).length === 0) continue;
        transitions.push({ row, before, target });
    }

    if (transitions.length) {
        await assertNotPinnedElsewhere({
            schoolId,
            session,
            retestItemIds: transitions.map(({ row }) => row._id),
            dbSession
        });
    }

    for (const { row, before, target } of transitions) {
        row.suppressedAt = target.suppressedAt ?? null;
        row.suppressedByCorrection = target.suppressedByCorrection ?? null;
        row.status = target.status;
        row.practiceMasteredAt = target.practiceMasteredAt ?? null;
        row.practiceMasteredBySession = target.practiceMasteredBySession ?? null;
        touched.push(row._id);
        await writeRetestTransition({
            schoolId,
            session,
            attempt,
            row,
            before,
            operationId,
            outcome,
            at,
            dbSession
        });
    }

    if (!newCorrect && rows.length === 0) {
        if (attempt.originalCountsAsMistake !== false) {
            throw domainError('LEGACY_CORRECTION_UNSAFE');
        }
        const obligation = await createRetestObligation({
            schoolId,
            studentId: session.student,
            session,
            attempt,
            item: {
                wordId: attempt.wordId,
                word: attempt.wordSnapshot,
                grade: attempt.grade,
                week: attempt.week,
                category: attempt.category,
                wordRevision: null
            },
            at: attempt.answeredAt || at,
            sourceAttempt: attempt._id,
            operationId,
            dbSession
        });
        if (obligation?.item?._id) touched.push(obligation.item._id);
    }

    return touched;
};

const loadAttemptOutcomes = async ({ schoolId, attemptIds, session, dbSession }) => {
    const outcomes = new Map();
    const remember = (attempt) => {
        outcomes.set(String(attempt._id), {
            correct: attempt.correct === true,
            skipped: attempt.skipped === true
        });
    };
    session.attempts.forEach(remember);
    const missing = attemptIds.filter((attemptId) => !outcomes.has(attemptId));
    if (!missing.length) return outcomes;

    const sessions = await SpellingSession.find({
        school: schoolId,
        'attempts._id': { $in: missing }
    })
        .select('mode attempts')
        .session(dbSession)
        .lean();
    for (const other of sessions) {
        for (const attempt of other.attempts || []) {
            if (!outcomes.has(String(attempt._id))) remember(attempt);
        }
    }
    return outcomes;
};

/**
 * Replays the retest group for a corrected retest answer. The unchanged replay
 * must reproduce the stored rows exactly before any write happens.
 */
const applyRetestAnswerCorrection = async ({
    schoolId,
    session,
    attempt,
    newCorrect,
    operationId,
    at,
    dbSession
}) => {
    const retestItem = await SpellingRetestItem.findOne({
        _id: attempt.retestItemId,
        school: schoolId,
        student: session.student
    })
        .select('sourceWord')
        .session(dbSession)
        .lean();
    // A retest answer with no reachable obligation cannot be replayed safely.
    if (!retestItem?.sourceWord) throw domainError('LEGACY_CORRECTION_UNSAFE');

    const [items, events] = await Promise.all([
        SpellingRetestItem.find({
            school: schoolId,
            student: session.student,
            sourceWord: retestItem.sourceWord
        }).session(dbSession),
        SpellingRetestEvent.find({
            school: schoolId,
            student: session.student,
            sourceWord: retestItem.sourceWord
        })
            .sort({ sequence: 1 })
            .session(dbSession)
            .lean()
    ]);
    if (events.length > MAX_LIFECYCLE_EVENTS) {
        throw domainError('CORRECTION_HISTORY_TOO_LARGE');
    }
    // An answer event without its recorded outcome came from a session that
    // predates attempt provenance; replaying it would guess the student's answer.
    if (events.some((event) => (
        event.kind === 'answer'
        && (!event.outcome || typeof event.outcome.correct !== 'boolean')
    ))) {
        throw domainError('LEGACY_CORRECTION_UNSAFE');
    }

    const attemptIds = [...new Set(events
        .filter((event) => event.kind === 'answer' && event.sourceAttempt)
        .map((event) => String(event.sourceAttempt)))];
    const outcomes = await loadAttemptOutcomes({ schoolId, attemptIds, session, dbSession });
    const replay = replayRetestGroup({ items, events, overrides: outcomes });
    if (!replay.safe) throw domainError('LEGACY_CORRECTION_UNSAFE');

    for (const item of items) {
        const replayed = replay.states.get(String(item._id));
        if (!replayed || compareRetestStates(snapshotRetestState(item), replayed).length) {
            throw domainError('LEGACY_CORRECTION_UNSAFE');
        }
    }

    outcomes.set(String(attempt._id), { correct: newCorrect, skipped: false });
    const corrected = replayRetestGroup({ items, events, overrides: outcomes });
    if (!corrected.safe) throw domainError('LEGACY_CORRECTION_UNSAFE');

    const changed = items.filter((item) => (
        compareRetestStates(snapshotRetestState(item), corrected.states.get(String(item._id))).length
    ));
    if (!changed.length) return [];
    await assertNotPinnedElsewhere({
        schoolId,
        session,
        retestItemIds: changed.map((item) => item._id),
        dbSession
    });

    const touched = [];
    for (const item of changed) {
        const before = snapshotRetestState(item);
        const target = corrected.states.get(String(item._id));
        for (const field of REPLAYED_STATE_FIELDS) item[field] = target[field] ?? null;
        const after = snapshotRetestState(item);
        item.revision = (Number(item.revision) || 1) + 1;
        const event = await recordRetestEvent({
            schoolId,
            studentId: session.student,
            sourceWord: item.sourceWord,
            kind: 'correction',
            outcome: { correct: newCorrect, skipped: false, formalTest: false },
            before,
            after,
            retestItemIds: [item._id],
            sourceSession: session._id,
            sourceAttempt: attempt._id,
            operationId,
            occurredAt: at,
            dbSession
        });
        if (Number.isInteger(event?.sequence)) item.lastEventSequence = event.sequence;
        await item.save({ session: dbSession });
        touched.push(item._id);
    }
    return touched;
};

const assertInput = ({ action, operationId, reason, expectedRevision, targetCorrectionRevision }) => {
    if (!['correct', 'incorrect', 'undo'].includes(action)) {
        throw domainError('INVALID_REQUEST', { details: [{ field: 'action' }] });
    }
    if (!operationId || typeof operationId !== 'string' || operationId.length < 8) {
        throw domainError('INVALID_REQUEST', { details: [{ field: 'operationId' }] });
    }
    const trimmed = String(reason ?? '').trim();
    if (trimmed.length < 5 || trimmed.length > 500) {
        throw domainError('INVALID_REQUEST', { details: [{ field: 'reason' }] });
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        throw domainError('EXPECTATION_REQUIRED', { details: [{ field: 'expectedRevision' }] });
    }
    if (action === 'undo'
        && (!Number.isInteger(targetCorrectionRevision) || targetCorrectionRevision < 1)) {
        throw domainError('EXPECTATION_REQUIRED', { details: [{ field: 'targetCorrectionRevision' }] });
    }
};

/**
 * One service behind correct / incorrect / undo. The student's first answer is
 * immutable; only the effective result and derived state change, in one
 * transaction with a bounded, replayable history.
 */
export async function setSpellingAttemptOutcome({
    schoolId,
    sessionId,
    attemptId,
    actorId,
    action,
    expectedRevision,
    targetCorrectionRevision = null,
    operationId,
    reason,
    now = new Date()
}) {
    assertInput({ action, operationId, reason, expectedRevision, targetCorrectionRevision });

    return withTransaction(async (dbSession) => {
        const session = await SpellingSession.findOne({
            _id: sessionId,
            school: schoolId
        }).session(dbSession);
        if (!session) throw domainError('SESSION_NOT_FOUND');

        const attempt = session.attempts.find(
            (entry) => String(entry._id) === String(attemptId)
        );
        if (!attempt) throw domainError('ATTEMPT_NOT_FOUND');

        const prior = (attempt.correctionHistory || []).find(
            (entry) => entry.operationId && entry.operationId === operationId
        );
        if (prior) {
            const sameRequest = prior.action === action
                && (action !== 'undo' || prior.targetCorrectionRevision === targetCorrectionRevision);
            if (!sameRequest) throw domainError('OPERATION_REUSED');
            return actionResult({ session, attempt });
        }

        if (attempt.revision !== expectedRevision) throw domainError('STALE_REVISION');
        if (session.status === 'abandoned') throw domainError('SESSION_ABANDONED');
        if (attempt.skipped) throw domainError('SKIPPED_ATTEMPT');

        let newCorrect;
        let targetEntry = null;
        if (action === 'undo') {
            if (targetCorrectionRevision !== attempt.revision) throw domainError('STALE_REVISION');
            const latest = attempt.correctionHistory?.[attempt.correctionHistory.length - 1];
            if (!latest || latest.revision !== targetCorrectionRevision || latest.action === 'undo') {
                throw domainError('NOTHING_TO_UNDO');
            }
            targetEntry = latest;
            newCorrect = latest.previousCorrect;
        } else {
            newCorrect = action === 'correct';
            if (attempt.correct === newCorrect) {
                return actionResult({ session, attempt });
            }
        }

        if ((attempt.correctionHistory?.length || 0) >= MAX_CORRECTION_HISTORY) {
            throw domainError('CORRECTION_HISTORY_TOO_LARGE');
        }

        const previousCorrect = attempt.correct === true;
        if (attempt.originalCorrect === null || attempt.originalCorrect === undefined) {
            attempt.originalCorrect = previousCorrect;
        }
        if (attempt.originalCountsAsMistake === null || attempt.originalCountsAsMistake === undefined) {
            attempt.originalCountsAsMistake = !previousCorrect && attempt.skipped !== true;
        }

        const retestItemIds = attempt.isRetest
            ? await applyRetestAnswerCorrection({
                schoolId,
                session,
                attempt,
                newCorrect,
                operationId,
                at: now,
                dbSession
            })
            : await applyOriginatingOutcome({
                schoolId,
                session,
                attempt,
                newCorrect,
                operationId,
                at: now,
                dbSession
            });

        attempt.correct = newCorrect;
        attempt.revision = (Number(attempt.revision) || 1) + 1;
        attempt.correctedAt = now;
        attempt.correctedBy = actorId;
        attempt.correctionHistory = [
            ...(attempt.correctionHistory || []),
            {
                revision: attempt.revision,
                operationId,
                actorId,
                at: now,
                reason: String(reason).trim(),
                previousCorrect,
                newCorrect,
                action,
                targetCorrectionRevision: targetEntry?.revision ?? null,
                retestItemIds,
                policyVersion: CORRECTION_POLICY_VERSION
            }
        ];

        const totals = countEffectiveTotals(session);
        session.correctCount = totals.correctCount;
        session.mistakeCount = totals.mistakeCount;
        session.revision = (Number(session.revision) || 1) + 1;
        await session.save({ session: dbSession });

        let gradebookSynced = false;
        if (session.status === 'completed' && session.assessmentType === 'formal-spelling-test') {
            await saveFormalSpellingGradebookEntry({ schoolId, session, dbSession });
            gradebookSynced = true;
        }
        return actionResult({ session, attempt, gradebookSynced, idempotent: false });
    });
}
