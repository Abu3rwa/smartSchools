import crypto from 'crypto';
import mongoose from 'mongoose';
import SpellingWord from '../models/SpellingWord.js';
import SpellingLibraryState from '../models/SpellingLibraryState.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingWordAuditLog from '../models/SpellingWordAuditLog.js';
import SpellingImportJob from '../models/SpellingImportJob.js';
import Student from '../models/Student.js';
import SpellingWordProgress from '../models/SpellingWordProgress.js';
import User from '../models/User.js';
import { withTransaction } from '../utils/withTransaction.js';
import { normalizeForGrading } from '../utils/spellingGrading.js';
import { normalizeWordKey } from '../utils/wordAudio.js';
import { domainError } from '../utils/spellingLibraryErrors.js';
import { computeLibraryImpact } from '../utils/spellingLibraryImpact.js';
import {
    canonicalStringify,
    hashPayload,
    createPreviewToken,
    verifyPreviewToken
} from '../utils/spellingPreviewToken.js';
import {
    getLibraryCapabilities,
    assertGradesEditable,
    canEditGrade
} from './spellingLibraryAccessService.js';
import {
    SPELLING_CURRICULUM_GRADES,
    isValidSpellingWeek
} from '../utils/spellingProgress.js';
import {
    sortedGrades,
    getOrCreateLibraryState,
    touchLibraryStates,
    gradeNeedsProgressMigration,
    getPlacementFloor,
    recalculateStudentProjection
} from './spellingProgressService.js';
import { propagateRetestTypo } from './spellingRetestStateService.js';
import { lookupPronunciations } from './spellingPronunciationService.js';
import {
    IMPORT_MAX_ROWS,
    IMPACT_MAX_STUDENTS,
    IMPACT_MAX_WORDS
} from '../validators/spellingLibraryValidators.js';

const STAGE_OFFSET = 100000;
const DEFAULT_PAGE_SIZE = 50;
const HISTORY_MAX_LIMIT = 50;

const byOrder = (first, second) => (
    (first.week - second.week)
    || (first.order - second.order)
    || String(first._id).localeCompare(String(second._id))
);

const activeOnly = (words = []) => words.filter((word) => !word.deletedAt);

const plain = (word) => (typeof word.toObject === 'function' ? word.toObject() : { ...word });

const idOf = (word) => String(word._id);

const mapByGrade = (words = []) => {
    const map = {};
    for (const grade of SPELLING_CURRICULUM_GRADES) map[grade] = [];
    for (const word of words) {
        const row = plain(word);
        if (!map[row.grade]) map[row.grade] = [];
        map[row.grade].push(row);
    }
    for (const grade of Object.keys(map)) map[grade].sort(byOrder);
    return map;
};

const cloneGradeMap = (map) => {
    const clone = {};
    for (const grade of Object.keys(map)) clone[grade] = map[grade].map((word) => ({ ...word }));
    return clone;
};

const weekList = (words, week) => words.filter((word) => !word.deletedAt && Number(word.week) === Number(week)).sort(byOrder);

const reindexWeek = (words, week) => {
    const list = weekList(words, week);
    list.forEach((word, index) => { word.order = index + 1; });
};

const insertIntoWeek = (words, doc, week, position) => {
    const list = weekList(words, week);
    const index = Math.min(Math.max(Number(position) || list.length + 1, 1), list.length + 1);
    list.splice(index - 1, 0, doc);
    list.forEach((word, orderIndex) => {
        word.week = Number(week);
        word.order = orderIndex + 1;
    });
};

const removeFromWords = (words, wordId) => {
    const index = words.findIndex((word) => idOf(word) === String(wordId));
    if (index === -1) return null;
    const [removed] = words.splice(index, 1);
    reindexWeek(words, removed.week);
    return removed;
};

const assertWeek = (grade, week) => {
    if (!isValidSpellingWeek(grade, week)) throw domainError('INVALID_POSITION');
};

const normalizeOrReject = (value) => {
    const normalized = normalizeForGrading(value);
    if (!normalized) throw domainError('INVALID_WORD');
    return normalized;
};

const validateAfterState = (grade, words) => {
    const weeks = new Set(activeOnly(words).map((word) => Number(word.week)));
    for (const week of weeks) {
        const list = weekList(words, week);
        const seen = new Set();
        list.forEach((word, index) => {
            if (!word.normalizedWord) throw domainError('INVALID_WORD');
            if (Number(word.order) !== index + 1) throw domainError('INVALID_ORDER', {
                details: [{ grade, week, field: 'order' }]
            });
            if (seen.has(word.normalizedWord)) throw domainError('DUPLICATE_WORD');
            seen.add(word.normalizedWord);
        });
    }
};

const wordValue = (word) => (word
    ? {
        grade: word.grade,
        week: word.week,
        category: word.category,
        word: word.word,
        definition: word.definition ?? '',
        order: word.order,
        revision: word.revision ?? null,
        deletedAt: word.deletedAt ?? null
    }
    : null);

const sameValue = (before, after) => canonicalStringify(wordValue(before)) === canonicalStringify(wordValue(after));

const diffPlans = (beforeMap, afterMap, grades) => {
    const added = [];
    const removed = [];
    const changed = [];
    for (const grade of grades) {
        const before = new Map((beforeMap[grade] || []).map((word) => [idOf(word), word]));
        const after = new Map((afterMap[grade] || []).map((word) => [idOf(word), word]));
        for (const [id, word] of after) {
            if (!before.has(id)) added.push(word);
            else if (!sameValue(before.get(id), word)) changed.push({ before: before.get(id), after: word });
        }
        for (const [id, word] of before) if (!after.has(id)) removed.push(word);
    }
    return { added, removed, changed };
};

const affectedWeeks = ({ beforeMap, afterMap, grades }) => {
    const weeks = {};
    for (const grade of grades) {
        const weeksForGrade = new Set();
        for (const word of [...(beforeMap[grade] || []), ...(afterMap[grade] || [])]) {
            if (!word.deletedAt) weeksForGrade.add(Number(word.week));
        }
        weeks[grade] = [...weeksForGrade];
    }
    return weeks;
};

const changedGrades = (beforeMap, afterMap, grades) => grades.filter((grade) => {
    const before = activeOnly(beforeMap[grade] || []);
    const after = activeOnly(afterMap[grade] || []);
    if (before.length !== after.length) return true;
    return !sameValueList(before, after);
});

const sameValueList = (before, after) => {
    const afterById = new Map(after.map((word) => [idOf(word), word]));
    return before.every((word) => sameValue(word, afterById.get(idOf(word))));
};

const emptyImpact = () => ({
    affectedStudents: 0,
    changedPositions: 0,
    newlyEligible: 0,
    removedEligibility: 0,
    retainedRetests: 0,
    retestsOnArchivedWords: 0
});

/**
 * Aggregates only: never returns a student identity. Progress rows are read in
 * one query per grade instead of one query per student.
 */
const computeImpactForGrades = async ({ schoolId, grades, beforeMap, afterMap, dbSession }) => {
    const impact = emptyImpact();
    for (const grade of grades) {
        const before = activeOnly(beforeMap[grade] || []);
        const after = activeOnly(afterMap[grade] || []);
        if (after.length > IMPACT_MAX_WORDS) throw domainError('IMPACT_TOO_LARGE');
        const studentQuery = Student.find({
            school: schoolId,
            $or: [
                { 'spelling.progressByGrade.grade': grade },
                { 'spelling.currentGrade': grade }
            ]
        }).select('_id spelling').limit(IMPACT_MAX_STUDENTS + 1);
        if (dbSession) studentQuery.session(dbSession);
        const students = await studentQuery.lean();
        if (students.length > IMPACT_MAX_STUDENTS) throw domainError('IMPACT_TOO_LARGE');
        const progressQuery = SpellingWordProgress.find({
            school: schoolId,
            grade,
            student: { $in: students.map((student) => student._id) }
        }).select('student wordId');
        if (dbSession) progressQuery.session(dbSession);
        const progressRows = await progressQuery.lean();
        const consumedByStudent = new Map();
        for (const row of progressRows) {
            const key = String(row.student);
            if (!consumedByStudent.has(key)) consumedByStudent.set(key, []);
            consumedByStudent.get(key).push(String(row.wordId));
        }
        const inputs = students.map((student) => ({
            id: String(student._id),
            floorWeek: getPlacementFloor({ student, grade }),
            consumedIds: consumedByStudent.get(String(student._id)) || []
        }));
        const wordIds = [...before.map((word) => word._id), ...after.map((word) => word._id)];
        const retestQuery = SpellingRetestItem.find({
            school: schoolId,
            sourceWord: { $in: wordIds },
            status: { $in: ['pending', 'practice-mastered'] },
            suppressedAt: null
        }).select('_id sourceWord student status suppressedAt revision');
        if (dbSession) retestQuery.session(dbSession);
        const retests = await retestQuery.lean();
        const gradeImpact = computeLibraryImpact({
            beforeWords: before,
            afterWords: after,
            students: inputs,
            retests,
            archivedIds: before.filter((word) => !after.some((entry) => idOf(entry) === idOf(word))).map((word) => word._id)
        });
        for (const key of Object.keys(impact)) impact[key] += gradeImpact[key] || 0;
    }
    return impact;
};

const stateDigestFor = async ({ schoolId, grades, dbSession }) => {
    const states = await fetchStates({ schoolId, grades, dbSession });
    const studentQuery = Student.find({
        school: schoolId,
        $or: grades.flatMap((grade) => [
            { 'spelling.progressByGrade.grade': grade },
            { 'spelling.currentGrade': grade }
        ])
    }).select('_id spelling.traversalRevision spelling.progressByGrade').limit(IMPACT_MAX_STUDENTS + 1);
    if (dbSession) studentQuery.session(dbSession);
    const students = await studentQuery.lean();
    if (students.length > IMPACT_MAX_STUDENTS) throw domainError('IMPACT_TOO_LARGE');
    const retestQuery = SpellingRetestItem.find({
        school: schoolId,
        grade: { $in: grades },
        status: { $in: ['pending', 'practice-mastered'] },
        suppressedAt: null
    }).select('_id revision status').limit(IMPACT_MAX_WORDS * 4);
    if (dbSession) retestQuery.session(dbSession);
    const retests = await retestQuery.lean();
    return {
        grades: states.map((state) => ({ grade: state.grade, version: state.version })),
        students: hashPayload(students.map((student) => [
            String(student._id),
            Number(student.spelling?.traversalRevision) || 0
        ]).sort((first, second) => first[0].localeCompare(second[0]))),
        retests: hashPayload(retests.map((retest) => [
            String(retest._id),
            Number(retest.revision) || 1,
            retest.status
        ]).sort((first, second) => first[0].localeCompare(second[0])))
    };
};

const fetchStates = async ({ schoolId, grades, dbSession }) => {
    if (!grades.length) return [];
    const query = SpellingLibraryState.find({ school: schoolId, grade: { $in: grades } });
    if (dbSession) query.session(dbSession);
    const states = await query.lean();
    const byGrade = new Map(states.map((state) => [state.grade, state]));
    return grades.map((grade) => byGrade.get(grade) || { grade, version: 1 });
};

const versionsMap = (states) => Object.fromEntries(states.map((state) => [state.grade, state.version]));

const assertExpectedVersions = ({ states, expected }) => {
    const versions = versionsMap(states);
    for (const state of states) {
        if (!expected || !Number.isInteger(expected[state.grade])) throw domainError('EXPECTATION_REQUIRED');
        if (expected[state.grade] !== state.version) throw domainError('STALE_LIBRARY');
    }
    return versions;
};

const pinnedGrades = async ({ schoolId, statuses, dbSession }) => {
    const query = SpellingSession.find({
        school: schoolId,
        status: { $in: statuses }
    }).select('assessmentType curriculumGrade formalTestWordList.grade currentItem.grade attempts.grade retestQuizItems');
    if (dbSession) query.session(dbSession);
    const sessions = await query.lean();
    const grades = new Set();
    const retestIds = [];
    for (const session of sessions) {
        if (session.curriculumGrade) grades.add(session.curriculumGrade);
        for (const item of session.formalTestWordList || []) if (item.grade) grades.add(item.grade);
        if (session.currentItem?.grade) grades.add(session.currentItem.grade);
        for (const attempt of session.attempts || []) if (attempt.grade) grades.add(attempt.grade);
        retestIds.push(...(session.retestQuizItems || []));
    }
    if (retestIds.length) {
        const retestQuery = SpellingRetestItem.find({
            school: schoolId,
            _id: { $in: retestIds }
        }).select('grade');
        if (dbSession) retestQuery.session(dbSession);
        for (const item of await retestQuery.lean()) if (item.grade) grades.add(item.grade);
    }
    return grades;
};

const assertNotPinned = async ({ schoolId, grades, dbSession }) => {
    const active = await pinnedGrades({ schoolId, statuses: ['in-progress'], dbSession });
    if (grades.some((grade) => active.has(grade))) throw domainError('ACTIVE_TEST');
    const scheduled = await pinnedGrades({ schoolId, statuses: ['scheduled'], dbSession });
    if (grades.some((grade) => scheduled.has(grade))) throw domainError('SCHEDULED_TEST');
};

const assertStructuralProgressReady = async ({ schoolId, grades, dbSession }) => {
    for (const grade of grades) {
        if (await gradeNeedsProgressMigration({ schoolId, grade, dbSession })) {
            throw domainError('MIGRATION_REQUIRED', { details: [{ grade }] });
        }
    }
};

const loadWordsForGrades = async ({ schoolId, grades, includeArchived = false, dbSession }) => {
    if (!grades.length) return [];
    const query = SpellingWord.find({
        school: schoolId,
        grade: { $in: grades },
        ...(includeArchived ? {} : { deletedAt: null })
    }).select('grade week category word definition normalizedWord order revision updatedBy deletedAt');
    if (dbSession) query.session(dbSession);
    return query.lean();
};

const revisionOf = (word, expectedRevisions) => {
    if (expectedRevisions && expectedRevisions[String(word._id)] !== undefined) {
        if (expectedRevisions[String(word._id)] !== Number(word.revision)) {
            throw domainError('STALE_REVISION');
        }
    }
    return Number(word.revision) || 1;
};

const assertExpectedRevisionsForWords = ({ words, expected, required = [] }) => {
    for (const word of words) revisionOf(word, expected);
    for (const wordId of required) {
        if (!expected || expected[String(wordId)] === undefined) {
            throw domainError('EXPECTATION_REQUIRED', { details: [{ field: 'expectedRevisions' }] });
        }
    }
};

const auditChange = (changeType, wordId, before, after) => ({
    wordId,
    changeType,
    before: wordValue(before),
    after: wordValue(after)
});

const insertWords = async ({ docs, dbSession }) => {
    if (!docs.length) return;
    await SpellingWord.insertMany(docs.map((doc) => plain(doc)), { session: dbSession, ordered: true });
};

const persistPlan = async ({
    schoolId,
    plan,
    actorId,
    operationId,
    dbSession
}) => {
    const { grades, beforeMap, afterMap } = plan;
    const diff = diffPlans(beforeMap, afterMap, grades);
    const weeks = affectedWeeks({ beforeMap, afterMap, grades });
    const now = new Date();

    for (const grade of grades) {
        const beforeWords = beforeMap[grade] || [];
        const afterWords = afterMap[grade] || [];
        const touchedWeeks = new Set(weeks[grade] || []);
        if (touchedWeeks.size === 0) continue;

        for (const week of touchedWeeks) {
            await SpellingWord.updateMany(
                { school: schoolId, grade, week, deletedAt: null },
                { $inc: { order: STAGE_OFFSET } },
                { session: dbSession }
            );
        }

        const archives = diff.removed.filter((word) => word.grade === grade);
        if (archives.length) {
            await SpellingWord.bulkWrite(archives.map((word) => ({
                updateOne: {
                    filter: { _id: word._id, school: schoolId, deletedAt: null },
                    update: {
                        $set: {
                            deletedAt: now,
                            deletedBy: actorId,
                            revision: (Number(word.revision) || 1) + 1,
                            lastChangeId: operationId
                        }
                    }
                }
            })), { session: dbSession, ordered: true });
        }

        const addedIds = new Set(diff.added.filter((word) => word.grade === grade).map((word) => idOf(word)));
        const surviving = afterWords
            .filter((word) => !addedIds.has(idOf(word)))
            .filter((word) => touchedWeeks.has(Number(word.week)) || beforeWords.some((entry) => (
                idOf(entry) === idOf(word) && touchedWeeks.has(Number(entry.week))
            )));
        if (surviving.length) {
            const beforeById = new Map(beforeWords.map((word) => [idOf(word), word]));
            await SpellingWord.bulkWrite(surviving.map((word) => {
                const before = beforeById.get(idOf(word)) || {};
                const revision = (Number(before.revision) || 1) + (sameValue(before, word) ? 0 : 1);
                word.revision = revision;
                return {
                    updateOne: {
                        filter: { _id: word._id, school: schoolId },
                        update: {
                            $set: {
                                week: word.week,
                                order: word.order,
                                category: word.category,
                                word: word.word,
                                definition: word.definition ?? '',
                                normalizedWord: word.normalizedWord,
                                deletedAt: null,
                                deletedBy: null,
                                revision,
                                updatedBy: actorId,
                                lastChangeId: operationId
                            }
                        }
                    }
                };
            }), { session: dbSession, ordered: true });
        }

        const addedWords = afterWords.filter((word) => addedIds.has(idOf(word)));
        if (addedWords.length) {
            const archivedById = new Map(
                (plan.sourceWords || []).filter((word) => word.deletedAt).map((word) => [idOf(word), word])
            );
            const reintroduced = addedWords.filter((word) => archivedById.has(idOf(word)));
            const inserted = addedWords.filter((word) => !archivedById.has(idOf(word)));
            if (reintroduced.length) {
                await SpellingWord.bulkWrite(reintroduced.map((word) => {
                    const revision = (Number(archivedById.get(idOf(word)).revision) || 1) + 1;
                    word.revision = revision;
                    return {
                        updateOne: {
                            filter: { _id: word._id, school: schoolId },
                            update: {
                                $set: {
                                    week: word.week,
                                    order: word.order,
                                    category: word.category,
                                    word: word.word,
                                    definition: word.definition ?? '',
                                    normalizedWord: word.normalizedWord,
                                    deletedAt: null,
                                    deletedBy: null,
                                    revision,
                                    updatedBy: actorId,
                                    lastChangeId: operationId
                                }
                            }
                        }
                    };
                }), { session: dbSession, ordered: true });
            }
            if (inserted.length) {
                await insertWords({
                    docs: inserted.map((word) => {
                        word.revision = 1;
                        return {
                            ...word,
                            school: schoolId,
                            createdBy: actorId,
                            updatedBy: actorId,
                            revision: 1,
                            deletedAt: null,
                            lastChangeId: operationId
                        };
                    }),
                    dbSession
                });
            }
        }
    }

    for (const change of plan.retestPropagation || []) {
        await propagateRetestTypo({
            schoolId,
            wordId: change.wordId,
            newText: change.newText,
            newRevision: change.newRevision,
            operationId,
            at: now,
            dbSession
        });
    }

    for (const grade of grades) {
        if (!plan.recalculateStudents?.includes(grade)) continue;
        const students = await Student.find({
            school: schoolId,
            $or: [
                { 'spelling.progressByGrade.grade': grade },
                { 'spelling.currentGrade': grade }
            ]
        }).select('_id').limit(IMPACT_MAX_STUDENTS + 1).session(dbSession).lean();
        if (students.length > IMPACT_MAX_STUDENTS) throw domainError('IMPACT_TOO_LARGE');
        for (const student of students) {
            await recalculateStudentProjection({
                schoolId,
                studentId: student._id,
                grade,
                words: activeOnly(afterMap[grade] || []),
                dbSession
            });
        }
    }

    return diff;
};

const bumpVersions = async ({ schoolId, grades, actorId, operationId, dbSession }) => {
    const states = [];
    for (const grade of sortedGrades(grades)) {
        const state = await getOrCreateLibraryState({ schoolId, grade, actorId, dbSession });
        state.version += 1;
        state.updatedBy = actorId;
        state.lastChangeId = operationId;
        await state.save({ session: dbSession });
        states.push(state);
    }
    return states;
};

const writeAudit = async ({
    schoolId,
    operationId,
    requestHash,
    actorId,
    actorRole,
    reason,
    source,
    action,
    versionsBefore,
    versionsAfter,
    diff,
    impact,
    previewDigest,
    result,
    importId,
    dbSession
}) => {
    const changes = [
        ...diff.added.map((word) => auditChange('add', word._id, null, word)),
        ...diff.removed.map((word) => auditChange('archive', word._id, word, null)),
        ...diff.changed.map(({ before, after }) => auditChange(
            before.normalizedWord !== after.normalizedWord ? 'typo' : (
                before.week !== after.week || before.order !== after.order ? 'reorder' : 'patch'
            ),
            after._id,
            before,
            after
        ))
    ];
    await SpellingWordAuditLog.create([{
        school: schoolId,
        operationId,
        requestHash,
        actor: actorId,
        actorRole,
        at: new Date(),
        reason,
        source,
        importId: importId || null,
        action,
        libraryVersionsBefore: versionsBefore.map(({ grade, version }) => ({ grade, version })),
        libraryVersionsAfter: versionsAfter.map(({ grade, version }) => ({ grade, version })),
        changes,
        impact: impact || null,
        previewDigest: previewDigest || null,
        result: result || null
    }], { session: dbSession });
};

const savedRow = (word) => ({
    _id: word._id,
    grade: word.grade,
    week: word.week,
    category: word.category,
    word: word.word,
    definition: word.definition ?? '',
    order: word.order,
    revision: Number(word.revision) || 1
});

const savedResult = ({ operationId, diff, versions, impact, includeRows = true }) => ({
    operationId,
    changedWords: diff.changed.map(({ after }) => after._id),
    addedWords: diff.added.map((word) => word._id),
    removedIds: diff.removed.map((word) => word._id),
    // Row snapshots let an open editor patch its own rows instead of
    // refetching the list. Imports are excluded because a replace can touch
    // thousands of rows; their UI reloads the page it shows.
    ...(includeRows
        ? {
            changedRows: diff.changed.map(({ after }) => savedRow(after)),
            addedRows: diff.added.map(savedRow)
        }
        : {}),
    libraryVersions: versions,
    impact
});

/**
 * Shared commit path. Everything is reloaded and validated inside the
 * transaction; the plan was computed from the same snapshot by the caller.
 */
const commitPlan = async ({
    ctx,
    plan,
    action,
    source,
    requestHash,
    operationId,
    reason,
    previewToken,
    confirmImpact,
    expectedVersions,
    expectedRevisions,
    importId
}) => {
    if (confirmImpact !== true) throw domainError('IMPACT_CONFIRMATION_REQUIRED');
    const grades = sortedGrades(plan.grades);
    if (grades.length === 0) throw domainError('INVALID_REQUEST');

    return withTransaction(async (dbSession) => {
        await assertGradesEditable({
            schoolId: ctx.schoolId,
            user: ctx.user,
            role: ctx.role,
            grades
        });

        const replay = await SpellingWordAuditLog.findOne({
            school: ctx.schoolId,
            operationId
        }).session(dbSession);
        if (replay) {
            if (replay.requestHash !== requestHash) throw domainError('OPERATION_REUSED');
            return { ...replay.result, idempotent: true };
        }

        await touchLibraryStates({
            schoolId: ctx.schoolId,
            grades,
            actorId: ctx.user?._id,
            dbSession
        });
        const states = await fetchStates({ schoolId: ctx.schoolId, grades, dbSession });
        assertExpectedVersions({ states, expected: expectedVersions });

        const freshWords = await loadWordsForGrades({
            schoolId: ctx.schoolId,
            grades,
            includeArchived: Boolean(plan.importMode),
            dbSession
        });
        assertExpectedRevisionsForWords({
            words: freshWords,
            expected: expectedRevisions,
            required: plan.requireRevisions
        });

        await assertNotPinned({ schoolId: ctx.schoolId, grades, dbSession });
        if (plan.structural) {
            await assertStructuralProgressReady({ schoolId: ctx.schoolId, grades, dbSession });
        }

        const impact = await computeImpactForGrades({
            schoolId: ctx.schoolId,
            grades,
            beforeMap: plan.beforeMap,
            afterMap: plan.afterMap,
            dbSession
        });

        if (plan.structural) {
            if (!previewToken) throw domainError('IMPACT_REQUIRED');
            const verified = verifyPreviewToken(previewToken);
            if (!verified.ok) {
                throw domainError(verified.reason === 'expired' ? 'IMPACT_EXPIRED' : 'IMPACT_CHANGED');
            }
            if (verified.payload.operationId && verified.payload.operationId !== operationId) {
                throw domainError('IMPACT_CHANGED');
            }
            const digest = await stateDigestFor({ schoolId: ctx.schoolId, grades, dbSession });
            const expectedPreview = {
                school: String(ctx.schoolId),
                actor: String(ctx.user?._id || ''),
                operationHash: plan.operationHash,
                state: digest
            };
            const received = {
                school: String(verified.payload.school || ''),
                actor: String(verified.payload.actor || ''),
                operationHash: verified.payload.operationHash || '',
                state: verified.payload.state || {}
            };
            if (canonicalStringify(expectedPreview) !== canonicalStringify(received)) {
                throw domainError('IMPACT_CHANGED');
            }
        }

        const diff = await persistPlan({
            schoolId: ctx.schoolId,
            plan,
            actorId: ctx.user?._id,
            operationId,
            dbSession
        });
        const changedGradeList = changedGrades(plan.beforeMap, plan.afterMap, grades);
        const statesAfter = changedGradeList.length
            ? await bumpVersions({
                schoolId: ctx.schoolId,
                grades: changedGradeList,
                actorId: ctx.user?._id,
                operationId,
                dbSession
            })
            : await fetchStates({ schoolId: ctx.schoolId, grades, dbSession });
        const versionsAfter = versionsMap(statesAfter);
        const result = savedResult({
            operationId,
            diff,
            versions: versionsAfter,
            impact,
            includeRows: !importId
        });
        await writeAudit({
            schoolId: ctx.schoolId,
            operationId,
            requestHash,
            actorId: ctx.user?._id,
            actorRole: ctx.role,
            reason,
            source,
            action,
            versionsBefore: states,
            versionsAfter: statesAfter,
            diff,
            impact,
            previewDigest: plan.previewDigest || null,
            result,
            importId,
            dbSession
        });
        return { ...result, idempotent: false, changedGradeList };
    });
};

// ---------------------------------------------------------------------------
// Read paths
// ---------------------------------------------------------------------------

const audioByWordMap = async (words) => {
    try {
        return await lookupPronunciations(words.map((word) => word.word));
    } catch (error) {
        void error;
        return new Map();
    }
};

const toWordDto = ({ word, libraryVersion, capabilities, audio }) => {
    const clips = audio?.clips || {};
    return {
        _id: word._id,
        grade: word.grade,
        week: word.week,
        category: word.category,
        word: word.word,
        definition: word.definition || '',
        order: word.order,
        revision: Number(word.revision) || 1,
        updatedAt: word.updatedAt || null,
        updatedBy: word.updatedBy || null,
        libraryVersion,
        permissions: {
            canEdit: canEditGrade(capabilities, word.grade),
            reasonCode: canEditGrade(capabilities, word.grade) ? null : capabilities.reasonCode
        },
        audio: { us: clips.us || null, uk: clips.uk || null, keyChanged: false }
    };
};

export const listLibraryWords = async ({ schoolId, user, role, query }) => {
    const grades = query.grade ? [query.grade] : [...SPELLING_CURRICULUM_GRADES];
    const filter = { school: schoolId, deletedAt: null };
    if (query.grade) filter.grade = query.grade;
    if (query.week) filter.week = Number(query.week);
    if (query.category) filter.category = query.category;
    if (query.search) {
        const escaped = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.word = { $regex: escaped, $options: 'i' };
    }
    const pageSize = query.pageSize || DEFAULT_PAGE_SIZE;
    const paged = Number.isInteger(query.page) && query.page > 0;
    let wordQuery = SpellingWord.find(filter)
        .sort({ grade: 1, week: 1, order: 1 })
        .select('grade week category word definition order revision updatedBy updatedAt deletedAt');
    if (paged) {
        wordQuery = wordQuery.skip((query.page - 1) * pageSize).limit(pageSize);
    } else {
        wordQuery = wordQuery.limit(query.limit || 5000);
    }
    const [words, total] = await Promise.all([
        wordQuery.lean(),
        paged ? SpellingWord.countDocuments(filter) : Promise.resolve(null)
    ]);
    const states = await fetchStates({ schoolId, grades: sortedGrades(grades) });
    const versions = versionsMap(states);
    const capabilities = await getLibraryCapabilities({ schoolId, user, role });
    const audio = await audioByWordMap(words);
    const categories = [...new Set(words.map((word) => word.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
        words: words.map((word) => toWordDto({
            word,
            libraryVersion: versions[word.grade] || 1,
            capabilities,
            audio: audio.get(normalizeWordKey(word.word))
        })),
        categories,
        libraryVersions: versions,
        capabilities,
        total,
        page: paged ? query.page : null,
        pageSize: paged ? pageSize : null
    };
};

export const getLibraryWord = async ({ schoolId, user, role, wordId, includeArchived = false }) => {
    if (!mongoose.Types.ObjectId.isValid(wordId)) throw domainError('INVALID_ID');
    const word = await SpellingWord.findOne({
        _id: wordId,
        school: schoolId,
        ...(includeArchived ? {} : { deletedAt: null })
    }).lean();
    if (!word) throw domainError('WORD_NOT_FOUND');
    const states = await fetchStates({ schoolId, grades: [word.grade] });
    const capabilities = await getLibraryCapabilities({ schoolId, user, role });
    const audio = await audioByWordMap([word]);
    return toWordDto({
        word,
        libraryVersion: states[0]?.version || 1,
        capabilities,
        audio: audio.get(normalizeWordKey(word.word))
    });
};

const decodeCursor = (cursor) => {
    if (!cursor) return null;
    try {
        const [createdAt, id] = Buffer.from(String(cursor), 'base64url').toString('utf8').split('|');
        const date = new Date(createdAt);
        if (Number.isNaN(date.getTime()) || !mongoose.Types.ObjectId.isValid(id)) return null;
        return { createdAt: date, id: new mongoose.Types.ObjectId(id) };
    } catch {
        return null;
    }
};

const encodeCursor = (entry) => Buffer.from(`${entry.createdAt.toISOString()}|${String(entry._id)}`, 'utf8').toString('base64url');

export const listLibraryHistory = async ({ schoolId, wordId, limit = 20, cursor }) => {
    if (!mongoose.Types.ObjectId.isValid(wordId)) throw domainError('INVALID_ID');
    const bounded = Math.min(Math.max(Number(limit) || 20, 1), HISTORY_MAX_LIMIT);
    const decoded = decodeCursor(cursor);
    const filter = { school: schoolId, 'changes.wordId': new mongoose.Types.ObjectId(wordId) };
    if (decoded) {
        filter.$or = [
            { createdAt: { $lt: decoded.createdAt } },
            { createdAt: decoded.createdAt, _id: { $lt: decoded.id } }
        ];
    }
    const [word, entries] = await Promise.all([
        SpellingWord.findOne({ _id: wordId, school: schoolId }).select('_id').lean(),
        SpellingWordAuditLog.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .limit(bounded + 1)
            .select('operationId actor actorRole at reason source action changes createdAt')
            .lean()
    ]);
    if (!word) throw domainError('WORD_NOT_FOUND');
    const hasMore = entries.length > bounded;
    const page = hasMore ? entries.slice(0, bounded) : entries;
    const actorIds = [...new Set(page.map((entry) => entry.actor).filter(Boolean).map(String))];
    const users = actorIds.length
        ? await User.find({ _id: { $in: actorIds }, school: schoolId }).select('firstName lastName').lean()
        : [];
    const names = new Map(users.map((user) => [String(user._id), `${user.firstName || ''} ${user.lastName || ''}`.trim()]));
    return {
        entries: page.map((entry) => ({
            operationId: entry.operationId,
            actorId: entry.actor,
            actorName: names.get(String(entry.actor)) || null,
            actorRole: entry.actorRole,
            at: entry.at || entry.createdAt,
            reason: entry.reason,
            source: entry.source,
            action: entry.action,
            changes: (entry.changes || [])
                .filter((change) => String(change.wordId) === String(wordId))
                .map((change) => ({
                    changeType: change.changeType,
                    before: change.before,
                    after: change.after
                }))
        })),
        nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null
    };
};

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

const planContext = ({
    beforeMap,
    afterMap,
    grades,
    operationHash,
    structural,
    requireRevisions = [],
    retestPropagation = [],
    recalculateStudents = [],
    sourceWords = [],
    importMode = null
}) => ({
    beforeMap,
    afterMap,
    grades,
    operationHash,
    structural,
    requireRevisions,
    retestPropagation,
    recalculateStudents,
    sourceWords,
    importMode
});

const buildAddPlan = ({ wordLists, input, operationHash }) => {
    const beforeMap = mapByGrade(wordLists);
    const afterMap = cloneGradeMap(beforeMap);
    assertWeek(input.grade, input.week);
    const doc = {
        _id: new mongoose.Types.ObjectId(),
        grade: input.grade,
        week: input.week,
        category: input.category,
        word: input.word,
        definition: input.definition || '',
        normalizedWord: normalizeOrReject(input.word),
        order: 1,
        revision: 1,
        deletedAt: null
    };
    insertIntoWeek(afterMap[input.grade], doc, input.week, input.position);
    validateAfterState(input.grade, afterMap[input.grade]);
    return planContext({
        beforeMap,
        afterMap,
        grades: [input.grade],
        operationHash,
        structural: true,
        recalculateStudents: [input.grade]
    });
};

const buildPatchPlan = ({ wordLists, wordId, input, operationHash }) => {
    const beforeMap = mapByGrade(wordLists);
    const grade = (wordLists.find((word) => idOf(word) === String(wordId)) || {}).grade;
    if (!grade) throw domainError('WORD_NOT_FOUND');
    const afterMap = cloneGradeMap(beforeMap);
    const currentWord = afterMap[grade].find((word) => idOf(word) === String(wordId));
    const patch = input.patch || {};

    if (patch.week !== undefined || patch.order !== undefined) {
        return buildMovePlan({
            wordLists,
            wordId,
            toWeek: patch.week ?? currentWord.week,
            toPosition: patch.order ?? currentWord.order,
            operationHash,
            operationHashOverride: operationHash
        });
    }

    const normalized = patch.word !== undefined ? normalizeOrReject(patch.word) : currentWord.normalizedWord;
    if (patch.word !== undefined && input.changeType !== 'typo') throw domainError('CHANGE_TYPE_REQUIRED');
    const next = {
        ...currentWord,
        ...(patch.word !== undefined ? { word: patch.word, normalizedWord: normalized } : {}),
        ...(patch.definition !== undefined ? { definition: patch.definition } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {})
    };
    const index = afterMap[grade].findIndex((word) => idOf(word) === String(wordId));
    afterMap[grade][index] = next;
    validateAfterState(grade, afterMap[grade]);
    const normalizedChanged = normalized !== currentWord.normalizedWord;
    return planContext({
        beforeMap,
        afterMap,
        grades: [grade],
        operationHash,
        structural: false,
        retestPropagation: normalizedChanged ? [{
            wordId: currentWord._id,
            newText: next.word,
            newRevision: (Number(currentWord.revision) || 1) + 1
        }] : [],
        requireRevisions: [String(wordId)]
    });
};

const buildArchivePlan = ({ wordLists, wordId, operationHash }) => {
    const beforeMap = mapByGrade(wordLists);
    const grade = (wordLists.find((word) => idOf(word) === String(wordId)) || {}).grade;
    if (!grade) throw domainError('WORD_NOT_FOUND');
    const afterMap = cloneGradeMap(beforeMap);
    removeFromWords(afterMap[grade], wordId);
    validateAfterState(grade, afterMap[grade]);
    return planContext({
        beforeMap,
        afterMap,
        grades: [grade],
        operationHash,
        structural: true,
        requireRevisions: [String(wordId)],
        recalculateStudents: [grade]
    });
};

const buildMovePlan = ({ wordLists, wordId, toWeek, toPosition, operationHash }) => {
    const beforeMap = mapByGrade(wordLists);
    const grade = (wordLists.find((word) => idOf(word) === String(wordId)) || {}).grade;
    if (!grade) throw domainError('WORD_NOT_FOUND');
    assertWeek(grade, toWeek);
    const afterMap = cloneGradeMap(beforeMap);
    const word = afterMap[grade].find((entry) => idOf(entry) === String(wordId));
    removeFromWords(afterMap[grade], wordId);
    insertIntoWeek(afterMap[grade], word, toWeek, toPosition);
    validateAfterState(grade, afterMap[grade]);
    return planContext({
        beforeMap,
        afterMap,
        grades: [grade],
        operationHash,
        structural: true,
        requireRevisions: [String(wordId)],
        recalculateStudents: [grade]
    });
};

const buildReorderPlan = ({ wordLists, grade, week, orderedWordIds, operationHash }) => {
    if (!SPELLING_CURRICULUM_GRADES.includes(grade)) throw domainError('INVALID_FILTER');
    assertWeek(grade, week);
    const beforeMap = mapByGrade(wordLists);
    const afterMap = cloneGradeMap(beforeMap);
    const list = weekList(afterMap[grade], week);
    const expectedIds = new Set(list.map((word) => idOf(word)));
    const givenIds = orderedWordIds.map(String);
    if (givenIds.length !== expectedIds.size || givenIds.some((id) => !expectedIds.has(id))) {
        throw domainError('INVALID_ORDER');
    }
    const byId = new Map(list.map((word) => [idOf(word), word]));
    afterMap[grade] = afterMap[grade].filter((word) => Number(word.week) !== Number(week) || !expectedIds.has(idOf(word)));
    givenIds.forEach((id, index) => {
        const word = { ...byId.get(id), order: index + 1, week: Number(week) };
        afterMap[grade].push(word);
    });
    validateAfterState(grade, afterMap[grade]);
    return planContext({
        beforeMap,
        afterMap,
        grades: [grade],
        operationHash,
        structural: true,
        requireRevisions: givenIds,
        recalculateStudents: [grade]
    });
};

const buildBulkPlan = ({ wordLists, input, operationHash }) => {
    const beforeMap = mapByGrade(wordLists);
    const afterMap = cloneGradeMap(beforeMap);
    const retestPropagation = [];
    const requireRevisions = [];
    const current = new Map(wordLists.map((word) => [idOf(word), { ...word }]));
    const syncCurrent = (grade) => {
        for (const word of afterMap[grade]) current.set(idOf(word), word);
    };

    for (const change of input.changes || []) {
        const existing = current.get(String(change.wordId));
        if (!existing || existing.deletedAt) throw domainError('WORD_NOT_FOUND');
        const target = afterMap[existing.grade].find((word) => idOf(word) === String(change.wordId));
        const patch = change.patch || {};
        if (patch.week !== undefined || patch.order !== undefined) {
            const moved = buildMovePlan({
                wordLists: Object.values(afterMap).flat(),
                wordId: change.wordId,
                toWeek: patch.week ?? target.week,
                toPosition: patch.order ?? target.order,
                operationHash
            });
            afterMap[existing.grade] = moved.afterMap[existing.grade];
            syncCurrent(existing.grade);
            requireRevisions.push(String(change.wordId));
            continue;
        }
        const normalized = patch.word !== undefined ? normalizeOrReject(patch.word) : target.normalizedWord;
        if (patch.word !== undefined && change.changeType !== 'typo') throw domainError('CHANGE_TYPE_REQUIRED');
        Object.assign(target, {
            ...(patch.word !== undefined ? { word: patch.word, normalizedWord: normalized } : {}),
            ...(patch.definition !== undefined ? { definition: patch.definition } : {}),
            ...(patch.category !== undefined ? { category: patch.category } : {})
        });
        if (normalized !== existing.normalizedWord) {
            retestPropagation.push({
                wordId: existing._id,
                newText: target.word,
                newRevision: (Number(existing.revision) || 1) + 1
            });
        }
        requireRevisions.push(String(change.wordId));
    }

    for (const wordId of input.removes || []) {
        const existing = current.get(String(wordId));
        if (!existing || existing.deletedAt) throw domainError('WORD_NOT_FOUND');
        removeFromWords(afterMap[existing.grade], wordId);
        current.delete(String(wordId));
        requireRevisions.push(String(wordId));
    }

    for (const add of input.adds || []) {
        assertWeek(add.grade, add.week);
        const doc = {
            _id: new mongoose.Types.ObjectId(),
            grade: add.grade,
            week: add.week,
            category: add.category,
            word: add.word,
            definition: add.definition || '',
            normalizedWord: normalizeOrReject(add.word),
            order: 1,
            revision: 1,
            deletedAt: null
        };
        insertIntoWeek(afterMap[add.grade], doc, add.week, add.position);
        current.set(idOf(doc), doc);
    }

    const grades = [...new Set(Object.keys(afterMap).filter((grade) => (
        JSON.stringify(beforeMap[grade]) !== JSON.stringify(afterMap[grade])
    )))];
    for (const grade of grades) validateAfterState(grade, afterMap[grade]);
    if (grades.length === 0) throw domainError('INVALID_REQUEST');
    return planContext({
        beforeMap,
        afterMap,
        grades,
        operationHash,
        structural: true,
        requireRevisions,
        retestPropagation,
        recalculateStudents: grades
    });
};

/**
 * Identity-safe import plan. Merge keeps unmentioned identities and rejects
 * ambiguous positions; replace matches within the full grade by exact
 * week+text one-to-one, considering archived identities for reintroduction.
 */
export const buildImportPlan = ({
    wordLists,
    rows,
    mode = 'merge',
    mappings = [],
    operationHash = '',
    collectAmbiguities = false
}) => {
    const beforeMap = mapByGrade(activeOnly(wordLists));
    const afterMap = cloneGradeMap(beforeMap);
    const grades = [...new Set(rows.map((row) => row.grade))];
    const mappingByRow = new Map(mappings.map((mapping) => [Number(mapping.rowNumber), mapping]));
    const mappedIds = new Set();
    const ambiguities = [];
    const candidateDto = (word) => ({
        wordId: idOf(word),
        week: Number(word.week),
        word: word.word,
        category: word.category,
        revision: Number(word.revision) || 1,
        archived: Boolean(word.deletedAt)
    });
    // Collection mode lets preview list every ambiguous row with its candidate
    // identities so the admin can choose mappings; commits still fail closed.
    const raiseAmbiguity = (row, candidates = []) => {
        if (!collectAmbiguities) {
            throw domainError('IDENTITY_AMBIGUOUS', { details: [{ row: Number(row.rowNumber) }] });
        }
        ambiguities.push({
            row: Number(row.rowNumber),
            candidates: candidates.slice(0, 10).map(candidateDto)
        });
    };

    for (const grade of grades) {
        const gradeRows = rows.filter((row) => row.grade === grade);
        if (gradeRows.length > IMPORT_MAX_ROWS) throw domainError('IMPORT_TOO_LARGE');
        const before = wordLists.filter((word) => word.grade === grade);
        if (mode === 'replace') {
            const byKey = new Map();
            for (const word of before) {
                const key = `${word.week}:${word.normalizedWord}`;
                if (!byKey.has(key)) byKey.set(key, []);
                byKey.get(key).push(word);
            }
            const used = new Set();
            const next = [];
            const rowsByWeek = new Map();
            for (const row of gradeRows) {
                if (!rowsByWeek.has(row.week)) rowsByWeek.set(row.week, []);
                rowsByWeek.get(row.week).push(row);
            }
            for (const [week, weekRows] of rowsByWeek) {
                assertWeek(grade, week);
                const orders = weekRows.map((row) => Number(row.order)).sort((a, b) => a - b);
                if (orders.some((order, index) => order !== index + 1)) {
                    throw domainError('INVALID_POSITION', { details: [{ grade, week, field: 'order' }] });
                }
                for (const row of weekRows.sort((a, b) => a.order - b.order)) {
                    const key = `${week}:${row.normalizedWord}`;
                    const mapped = mappingByRow.get(Number(row.rowNumber));
                    let match = null;
                    if (mapped) {
                        match = before.find((word) => idOf(word) === String(mapped.wordId) && word.grade === grade);
                        if (!match) throw domainError('INVALID_ID', { details: [{ row: row.rowNumber }] });
                        if (used.has(idOf(match))) throw domainError('IDENTITY_AMBIGUOUS');
                        if (mapped.expectedRevision !== undefined
                            && Number(mapped.expectedRevision) !== (Number(match.revision) || 1)) {
                            throw domainError('STALE_REVISION', { details: [{ row: row.rowNumber }] });
                        }
                        if (!match.deletedAt && Number(match.week) !== Number(week)) {
                            throw domainError('IDENTITY_AMBIGUOUS', { details: [{ row: row.rowNumber }] });
                        }
                    } else {
                        const candidates = (byKey.get(key) || []).filter((word) => !used.has(idOf(word)));
                        const activeCandidates = candidates.filter((word) => !word.deletedAt);
                        if (activeCandidates.length === 1) match = activeCandidates[0];
                        else if (activeCandidates.length === 0 && candidates.length === 1) match = candidates[0];
                        else if (candidates.length > 1) {
                            raiseAmbiguity(row, candidates);
                        }
                    }
                    if (match) used.add(idOf(match));
                    next.push({
                        _id: match?._id || new mongoose.Types.ObjectId(),
                        grade,
                        week,
                        order: Number(row.order),
                        category: row.category,
                        word: row.word,
                        definition: Object.hasOwn(row, 'definition') ? row.definition : (match?.definition || ''),
                        normalizedWord: row.normalizedWord,
                        revision: match ? (Number(match.revision) || 1) : 1,
                        deletedAt: null
                    });
                }
            }
            afterMap[grade] = next.sort(byOrder);
        } else {
            const rowsByWeek = new Map();
            for (const row of gradeRows) {
                if (!rowsByWeek.has(row.week)) rowsByWeek.set(row.week, []);
                rowsByWeek.get(row.week).push(row);
            }
            for (const [week, weekRows] of rowsByWeek) {
                assertWeek(grade, week);
                const orders = weekRows.map((row) => Number(row.order));
                if (new Set(orders).size !== orders.length) throw domainError('INVALID_POSITION');
                const existing = weekList(afterMap[grade], week);
                const existingByKey = new Map();
                for (const word of existing) {
                    if (!existingByKey.has(word.normalizedWord)) existingByKey.set(word.normalizedWord, []);
                    existingByKey.get(word.normalizedWord).push(word);
                }
                const targeted = new Set();
                const rowDocs = weekRows.sort((a, b) => a.order - b.order).map((row) => {
                    const mapped = mappingByRow.get(Number(row.rowNumber));
                    let identity = null;
                    if (mapped) {
                        identity = before.find((word) => idOf(word) === String(mapped.wordId));
                        if (!identity) throw domainError('INVALID_ID', { details: [{ row: row.rowNumber }] });
                        if (mappedIds.has(idOf(identity))) throw domainError('IDENTITY_AMBIGUOUS');
                        mappedIds.add(idOf(identity));
                        if (mapped.expectedRevision !== undefined
                            && Number(mapped.expectedRevision) !== (Number(identity.revision) || 1)) {
                            throw domainError('STALE_REVISION', { details: [{ row: row.rowNumber }] });
                        }
                        if (!identity.deletedAt && !existing.some((word) => idOf(word) === idOf(identity))) {
                            throw domainError('IDENTITY_AMBIGUOUS', { details: [{ row: row.rowNumber }] });
                        }
                    } else {
                        const candidates = (existingByKey.get(row.normalizedWord) || []).filter((word) => !targeted.has(idOf(word)));
                        if (candidates.length > 1) raiseAmbiguity(row, candidates);
                        identity = candidates[0] || null;
                    }
                    if (identity && !identity.deletedAt) targeted.add(idOf(identity));
                    return {
                        _id: identity?._id || new mongoose.Types.ObjectId(),
                        grade,
                        week,
                        order: Number(row.order),
                        category: row.category,
                        word: row.word,
                        definition: Object.hasOwn(row, 'definition') ? row.definition : (identity?.definition || ''),
                        normalizedWord: row.normalizedWord,
                        revision: identity ? (Number(identity.revision) || 1) : 1,
                        deletedAt: null
                    };
                });
                const untargeted = existing.filter((word) => !targeted.has(idOf(word)));
                const slots = [];
                let maxSlot = Math.max(
                    ...rowDocs.map((row) => row.order),
                    untargeted.length
                );
                if (!Number.isFinite(maxSlot) || maxSlot < 0) maxSlot = 0;
                for (const row of rowDocs) {
                    if (slots[row.order - 1]) {
                        const sourceRow = weekRows.find((entry) => Number(entry.order) === Number(row.order));
                        raiseAmbiguity(sourceRow || { rowNumber: 0 }, [slots[row.order - 1]]);
                    }
                    slots[row.order - 1] = row;
                }
                let slotIndex = 0;
                for (const word of untargeted) {
                    while (slots[slotIndex]) slotIndex += 1;
                    slots[slotIndex] = word;
                    slotIndex += 1;
                }
                const compact = slots.filter(Boolean);
                compact.forEach((word, index) => { word.order = index + 1; });
                afterMap[grade] = [
                    ...afterMap[grade].filter((word) => Number(word.week) !== Number(week)),
                    ...compact
                ];
            }
        }
        afterMap[grade].sort(byOrder);
        validateAfterState(grade, afterMap[grade]);
    }

    return {
        ...planContext({
            beforeMap,
            afterMap,
            grades: sortedGrades(grades),
            operationHash,
            structural: true,
            recalculateStudents: sortedGrades(grades),
            sourceWords: wordLists,
            importMode: mode
        }),
        ambiguities
    };
};

/**
 * Pure preview summary: what the file will add, update and remove, plus the
 * full-grade scope a replace touches (not only the weeks visible in the file).
 */
export const summarizeImportPlan = ({ plan, wordLists = [], mode = 'merge' }) => {
    const grades = sortedGrades(plan.grades || []);
    const diff = diffPlans(plan.beforeMap, plan.afterMap, grades);
    const archivedIds = new Set(
        wordLists.filter((word) => word.deletedAt).map((word) => idOf(word))
    );
    const reusedArchived = [...diff.added].filter((word) => archivedIds.has(idOf(word))).length;
    const replaceScope = mode === 'replace'
        ? grades.map((grade) => {
            const before = plan.beforeMap[grade] || [];
            const after = plan.afterMap[grade] || [];
            const beforeIds = new Set(before.map((word) => idOf(word)));
            const kept = after.filter((word) => beforeIds.has(idOf(word))).length;
            return {
                grade,
                currentWords: before.length,
                kept,
                removed: before.length - kept,
                added: after.length - kept
            };
        })
        : null;
    return {
        planned: {
            added: diff.added.length,
            updated: diff.changed.length,
            removed: diff.removed.length,
            reusedArchived
        },
        replaceScope
    };
};

export const importPlanHasChanges = (plan) => {
    const diff = diffPlans(plan.beforeMap, plan.afterMap, sortedGrades(plan.grades || []));
    return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
};

const planFromBody = ({ wordLists, kind, body, operationHash }) => {
    if (kind === 'add') return buildAddPlan({ wordLists, input: body, operationHash });
    if (kind === 'patch' || kind === 'move') {
        // Impact previews send `{toWeek,toPosition}`; commits send the same
        // values inside `patch`. Normalize both to one move shape.
        const patch = kind === 'move'
            ? { week: body.toWeek ?? body.patch?.week, order: body.toPosition ?? body.patch?.order }
            : body.patch;
        if (kind === 'move' && (!Number.isInteger(patch.week) || !Number.isInteger(patch.order))) {
            throw domainError('INVALID_REQUEST', { details: [{ field: 'toWeek' }, { field: 'toPosition' }] });
        }
        return buildPatchPlan({ wordLists, wordId: body.wordId, input: { ...body, patch }, operationHash });
    }
    if (kind === 'remove') return buildArchivePlan({ wordLists, wordId: body.wordId, operationHash });
    if (kind === 'reorder') return buildReorderPlan({
        wordLists,
        grade: body.grade,
        week: body.week,
        orderedWordIds: body.orderedWordIds,
        operationHash
    });
    if (kind === 'bulk') return buildBulkPlan({ wordLists, input: body, operationHash });
    throw domainError('INVALID_REQUEST');
};

const pick = (source, keys) => Object.fromEntries(
    keys.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]])
);

const PATCH_FIELDS = ['word', 'definition', 'category', 'week', 'order'];

/**
 * The exact allowlisted body used for both the preview digest and the commit.
 * Neither path may hash a different field set or the two would disagree.
 */
const normalizeOperationBody = (kind, body) => {
    if (kind === 'add') return pick(body, ['grade', 'week', 'category', 'word', 'definition', 'position']);
    if (kind === 'patch' || kind === 'move') {
        return {
            wordId: body.wordId,
            patch: kind === 'move'
                ? { week: body.toWeek ?? body.patch?.week, order: body.toPosition ?? body.patch?.order }
                : pick(body.patch || {}, PATCH_FIELDS),
            ...(body.changeType ? { changeType: body.changeType } : {})
        };
    }
    if (kind === 'remove') return { wordId: body.wordId };
    if (kind === 'reorder') {
        return { grade: body.grade, week: body.week, orderedWordIds: body.orderedWordIds };
    }
    if (kind === 'bulk') {
        return {
            changes: (body.changes || []).map((change) => ({
                wordId: change.wordId,
                patch: pick(change.patch || {}, PATCH_FIELDS),
                ...(change.changeType ? { changeType: change.changeType } : {})
            })),
            adds: (body.adds || []).map((add) => pick(add, ['grade', 'week', 'category', 'word', 'definition', 'position'])),
            removes: [...(body.removes || [])]
        };
    }
    throw domainError('INVALID_REQUEST');
};

const deriveExpectedRevisions = (kind, body) => {
    if (kind === 'patch' || kind === 'move' || kind === 'remove') {
        return body.wordId && body.expectedRevision !== undefined
            ? { [String(body.wordId)]: body.expectedRevision }
            : null;
    }
    if (kind === 'reorder') return body.expectedRevisions || null;
    if (kind === 'bulk') {
        const merged = Object.fromEntries(
            (body.changes || []).filter((change) => change.expectedRevision !== undefined)
                .map((change) => [String(change.wordId), change.expectedRevision])
        );
        for (const [wordId, revision] of Object.entries(body.expectedRevisions || {})) merged[wordId] = revision;
        return Object.keys(merged).length ? merged : null;
    }
    return null;
};

const operationHashFor = ({ kind, body, expectedRevisions }) => hashPayload({
    kind,
    body: normalizeOperationBody(kind, body),
    expectedRevisions: expectedRevisions || null
});

const freshOperationId = () => crypto.randomUUID();

const requireEnvelope = ({ operationId, reason }) => {
    if (!operationId) throw domainError('EXPECTATION_REQUIRED', { details: [{ field: 'operationId' }] });
    if (!reason) throw domainError('INVALID_REQUEST', { details: [{ field: 'reason' }] });
    return operationId;
};

const resolveOperationGrades = async ({ schoolId, kind, body }) => {
    if (kind === 'add' || kind === 'reorder') return [body.grade];
    if (kind === 'bulk') {
        const ids = [...new Set([
            ...(body.changes || []).map((change) => String(change.wordId)),
            ...(body.removes || []).map(String)
        ])];
        if (ids.length !== (body.changes || []).length + (body.removes || []).length) {
            throw domainError('INVALID_REQUEST', { details: [{ field: 'changes', message: 'each word once' }] });
        }
        const grades = new Set((body.adds || []).map((add) => add.grade));
        if (ids.length) {
            const docs = await SpellingWord.find({
                school: schoolId,
                _id: { $in: ids },
                deletedAt: null
            }).select('_id grade').lean();
            if (docs.length !== ids.length) throw domainError('WORD_NOT_FOUND');
            for (const doc of docs) grades.add(doc.grade);
        }
        if (grades.size === 0) throw domainError('INVALID_REQUEST');
        return sortedGrades([...grades]);
    }
    if (!mongoose.Types.ObjectId.isValid(body.wordId)) throw domainError('INVALID_ID');
    const word = await SpellingWord.findOne({
        _id: body.wordId,
        school: schoolId,
        deletedAt: null
    }).select('grade').lean();
    if (!word) throw domainError('WORD_NOT_FOUND');
    return [word.grade];
};

const expectedVersionsFor = ({ grades, expectedLibraryVersion, expectedLibraryVersions }) => {
    if (expectedLibraryVersions) return expectedLibraryVersions;
    if (Number.isInteger(expectedLibraryVersion)) {
        return Object.fromEntries(grades.map((grade) => [grade, expectedLibraryVersion]));
    }
    return undefined;
};

const loadWordLists = async ({ schoolId, grades, dbSession, includeArchived = false }) => loadWordsForGrades({
    schoolId,
    grades,
    includeArchived,
    dbSession
});

export const previewLibraryOperation = async ({
    schoolId,
    user,
    role,
    operation,
    expectedLibraryVersions,
    expectedRevisions,
    operationId
}) => {
    const kind = operation?.kind;
    if (!kind) throw domainError('INVALID_REQUEST');
    const expected = expectedRevisions || deriveExpectedRevisions(kind, operation);
    const grades = await resolveOperationGrades({ schoolId, kind, body: operation });
    await assertGradesEditable({ schoolId, user, role, grades });
    const loaded = await loadWordLists({ schoolId, grades });
    const plan = planFromBody({
        wordLists: loaded,
        kind,
        body: operation,
        operationHash: operationHashFor({ kind, body: operation, expectedRevisions: expected })
    });
    const states = await fetchStates({ schoolId, grades });
    const versions = assertExpectedVersions({
        states,
        expected: expectedVersionsFor({
            grades,
            expectedLibraryVersion: operation.expectedLibraryVersion,
            expectedLibraryVersions
        })
    });
    assertExpectedRevisionsForWords({ words: loaded, expected, required: plan.requireRevisions });
    await assertNotPinned({ schoolId, grades });
    if (plan.structural) await assertStructuralProgressReady({ schoolId, grades });
    const impact = await computeImpactForGrades({
        schoolId,
        grades,
        beforeMap: plan.beforeMap,
        afterMap: plan.afterMap
    });
    const digest = await stateDigestFor({ schoolId, grades });
    const previewToken = createPreviewToken({
        school: String(schoolId),
        actor: String(user?._id || ''),
        operationId: operationId || null,
        operationHash: plan.operationHash,
        state: digest
    });
    const added = diffPlans(plan.beforeMap, plan.afterMap, grades).added.map((word) => word._id);
    return {
        previewToken,
        impact,
        libraryVersions: versions,
        operationHash: plan.operationHash,
        proposedNewIds: added,
        committable: true
    };
};

const commitSingle = async ({
    ctx,
    kind,
    body,
    operationId,
    reason,
    requestHash,
    previewToken,
    confirmImpact,
    expectedLibraryVersion,
    expectedLibraryVersions
}) => {
    const expectedRevisions = deriveExpectedRevisions(kind, body);
    const grades = await resolveOperationGrades({ schoolId: ctx.schoolId, kind, body });
    const loaded = await loadWordLists({ schoolId: ctx.schoolId, grades });
    const plan = planFromBody({
        wordLists: loaded,
        kind,
        body,
        operationHash: operationHashFor({ kind, body, expectedRevisions })
    });
    return commitPlan({
        ctx,
        plan,
        action: kind,
        source: kind === 'bulk' ? 'bulk' : 'single',
        requestHash,
        operationId,
        reason,
        previewToken,
        confirmImpact,
        expectedVersions: expectedVersionsFor({ grades, expectedLibraryVersion, expectedLibraryVersions }),
        expectedRevisions,
        importId: null
    });
};

const assertImportRole = (role) => {
    if (role !== 'admin' && role !== 'super_admin') throw domainError('ROLE_FORBIDDEN');
};

export const updateLibraryWord = async ({ schoolId, user, role, wordId, input }) => {
    const operationId = requireEnvelope({ operationId: input.operationId, reason: input.reason });
    const body = {
        wordId,
        patch: input.patch,
        expectedRevision: input.expectedRevision,
        ...(input.changeType ? { changeType: input.changeType } : {})
    };
    const kind = body.patch.week !== undefined || body.patch.order !== undefined ? 'move' : 'patch';
    return commitSingle({
        ctx: { schoolId, user, role },
        kind,
        body,
        operationId,
        reason: input.reason,
        requestHash: hashPayload({ kind, body: normalizeOperationBody(kind, body), expectedRevisions: deriveExpectedRevisions(kind, body) }),
        previewToken: input.previewToken,
        confirmImpact: input.confirmImpact,
        expectedLibraryVersion: input.expectedLibraryVersion,
        expectedLibraryVersions: input.expectedLibraryVersions
    });
};

export const addLibraryWord = async ({ schoolId, user, role, input }) => {
    const operationId = requireEnvelope({ operationId: input.operationId, reason: input.reason });
    return commitSingle({
        ctx: { schoolId, user, role },
        kind: 'add',
        body: input,
        operationId,
        reason: input.reason,
        requestHash: hashPayload({ kind: 'add', body: normalizeOperationBody('add', input) }),
        previewToken: input.previewToken,
        confirmImpact: input.confirmImpact,
        expectedLibraryVersion: input.expectedLibraryVersion,
        expectedLibraryVersions: input.expectedLibraryVersions
    });
};

export const archiveLibraryWord = async ({ schoolId, user, role, wordId, input }) => {
    const operationId = requireEnvelope({ operationId: input.operationId, reason: input.reason });
    const body = { wordId, expectedRevision: input.expectedRevision };
    return commitSingle({
        ctx: { schoolId, user, role },
        kind: 'remove',
        body,
        operationId,
        reason: input.reason,
        requestHash: hashPayload({ kind: 'remove', body, expectedRevisions: deriveExpectedRevisions('remove', body) }),
        previewToken: input.previewToken,
        confirmImpact: input.confirmImpact,
        expectedLibraryVersion: input.expectedLibraryVersion,
        expectedLibraryVersions: input.expectedLibraryVersions
    });
};

export const reorderLibraryWeek = async ({ schoolId, user, role, grade, week, input }) => {
    const operationId = requireEnvelope({ operationId: input.operationId, reason: input.reason });
    const body = {
        grade,
        week,
        orderedWordIds: input.orderedWordIds,
        expectedRevisions: input.expectedRevisions
    };
    return commitSingle({
        ctx: { schoolId, user, role },
        kind: 'reorder',
        body,
        operationId,
        reason: input.reason,
        requestHash: hashPayload({ kind: 'reorder', body, expectedRevisions: body.expectedRevisions || null }),
        previewToken: input.previewToken,
        confirmImpact: input.confirmImpact,
        expectedLibraryVersion: input.expectedLibraryVersion,
        expectedLibraryVersions: input.expectedLibraryVersions
    });
};

export const moveLibraryWord = async ({ schoolId, user, role, wordId, input }) => {
    const operationId = requireEnvelope({ operationId: input.operationId, reason: input.reason });
    const body = {
        wordId,
        patch: { week: input.toWeek, order: input.toPosition },
        expectedRevision: input.expectedRevision
    };
    return commitSingle({
        ctx: { schoolId, user, role },
        kind: 'move',
        body,
        operationId,
        reason: input.reason,
        requestHash: hashPayload({ kind: 'move', body, expectedRevisions: deriveExpectedRevisions('move', body) }),
        previewToken: input.previewToken,
        confirmImpact: input.confirmImpact,
        expectedLibraryVersion: input.expectedLibraryVersion,
        expectedLibraryVersions: input.expectedLibraryVersions
    });
};

export const bulkLibraryMutation = async ({ schoolId, user, role, input }) => {
    const operationId = requireEnvelope({ operationId: input.operationId, reason: input.reason });
    const body = input;
    return commitSingle({
        ctx: { schoolId, user, role },
        kind: 'bulk',
        body,
        operationId,
        reason: input.reason,
        requestHash: hashPayload({ kind: 'bulk', body: normalizeOperationBody('bulk', body), expectedRevisions: deriveExpectedRevisions('bulk', body) }),
        previewToken: input.previewToken,
        confirmImpact: input.confirmImpact,
        expectedLibraryVersion: input.expectedLibraryVersion,
        expectedLibraryVersions: input.expectedLibraryVersions
    });
};

export const commitLibraryImport = async ({ schoolId, user, role, job, input }) => {
    assertImportRole(role);
    const operationId = requireEnvelope({ operationId: input.operationId, reason: input.reason });
    if (String(job.uploadedBy) !== String(user?._id)) throw domainError('IMPORT_OWNER');
    if (input.importId && String(input.importId) !== String(job._id)) throw domainError('IMPORT_NOT_FOUND');
    if (job.status === 'committed') {
        return { ...(job.result || {}), idempotent: true };
    }
    if (job.status !== 'preview') throw domainError('IMPORT_INVALID');
    if (job.errors?.length) throw domainError('IMPORT_INVALID');
    if (job.expiresAt && new Date(job.expiresAt).getTime() <= Date.now()) throw domainError('IMPORT_EXPIRED');
    const mode = input.replace === true ? 'replace' : (input.mode || job.mode || 'merge');
    if (mode !== job.mode) throw domainError('IMPORT_MODE_CHANGED');
    const mappings = input.identityMappings || job.identityMappings || [];
    if (hashPayload(mappings) !== (job.identityMappingDigest || hashPayload(job.identityMappings || []))) {
        throw domainError('IMPORT_MODE_CHANGED');
    }

    return withTransaction(async (dbSession) => {
        const lockedJob = await SpellingImportJob.findOne({ _id: job._id, school: schoolId }).session(dbSession);
        if (!lockedJob) throw domainError('IMPORT_NOT_FOUND');
        if (lockedJob.status === 'committed') return { ...(lockedJob.result || {}), idempotent: true };
        if (lockedJob.status !== 'preview') throw domainError('IMPORT_INVALID');
        if (lockedJob.errors?.length) throw domainError('IMPORT_INVALID');
        if (lockedJob.expiresAt && new Date(lockedJob.expiresAt).getTime() <= Date.now()) throw domainError('IMPORT_EXPIRED');

        const grades = sortedGrades([...new Set(lockedJob.rows.map((row) => row.grade))]);
        await assertGradesEditable({ schoolId, user, role, grades });
        const loaded = await loadWordLists({ schoolId, grades, dbSession, includeArchived: true });
        const plan = buildImportPlan({
            wordLists: loaded,
            rows: lockedJob.rows,
            mode,
            mappings,
            operationHash: lockedJob.previewDigest || ''
        });
        if (!importPlanHasChanges(plan)) {
            // A file identical to the current library keeps IDs, revisions,
            // consumed words and grade versions exactly as they are.
            if (input.confirmImpact !== true) throw domainError('IMPACT_CONFIRMATION_REQUIRED');
            const states = await fetchStates({ schoolId, grades, dbSession });
            const noopResult = {
                operationId,
                changedWords: [],
                addedWords: [],
                removedIds: [],
                libraryVersions: versionsMap(states),
                impact: emptyImpact(),
                noop: true
            };
            await SpellingImportJob.findOneAndUpdate(
                { _id: lockedJob._id, school: schoolId },
                {
                    $set: {
                        status: 'committed',
                        committedAt: new Date(),
                        committedBy: user?._id,
                        result: noopResult
                    }
                },
                { new: true, session: dbSession }
            );
            return { ...noopResult, idempotent: false };
        }
        const expectedVersions = input.expectedLibraryVersions || lockedJob.expectedLibraryVersions || {};
        const result = await commitPlan({
            ctx: { schoolId, user, role },
            plan,
            action: `import-${mode}`,
            source: 'import',
            requestHash: hashPayload({ kind: 'import', importId: String(lockedJob._id), mode, mappings }),
            operationId,
            reason: input.reason,
            previewToken: input.previewToken,
            confirmImpact: input.confirmImpact,
            expectedVersions,
            expectedRevisions: Object.fromEntries(
                mappings.filter((mapping) => mapping.expectedRevision !== undefined)
                    .map((mapping) => [String(mapping.wordId), mapping.expectedRevision])
            ),
            importId: lockedJob._id
        });
        await SpellingImportJob.findOneAndUpdate(
            { _id: lockedJob._id, school: schoolId },
            {
                $set: {
                    status: 'committed',
                    committedAt: new Date(),
                    committedBy: user?._id,
                    result
                }
            },
            { new: true, session: dbSession }
        );
        return result;
    });
};

export const importOperationHash = ({ rows, mode, mappings }) => hashPayload({
    kind: 'import',
    mode,
    mappings: mappings || [],
    rows: (rows || []).map((row) => ({
        rowNumber: row.rowNumber,
        grade: row.grade,
        week: row.week,
        order: row.order,
        category: row.category,
        word: row.word,
        normalizedWord: row.normalizedWord,
        definition: Object.hasOwn(row, 'definition') ? row.definition : null
    }))
});

export const createImportPreviewState = async ({ schoolId, rows, mode, mappings }) => {
    const grades = sortedGrades([...new Set(rows.map((row) => row.grade))]);
    const loaded = await loadWordLists({ schoolId, grades, includeArchived: true });
    const operationHash = importOperationHash({ rows, mode, mappings });
    const plan = buildImportPlan({
        wordLists: loaded,
        rows,
        mode,
        mappings,
        operationHash,
        collectAmbiguities: true
    });
    const states = await fetchStates({ schoolId, grades });
    const libraryVersions = versionsMap(states);
    if (plan.ambiguities.length) {
        return {
            plan,
            impact: null,
            grades,
            digest: null,
            operationHash,
            libraryVersions,
            ambiguities: plan.ambiguities
        };
    }
    const impact = await computeImpactForGrades({
        schoolId,
        grades,
        beforeMap: plan.beforeMap,
        afterMap: plan.afterMap
    });
    const digest = await stateDigestFor({ schoolId, grades });
    return {
        plan,
        impact,
        grades,
        digest,
        operationHash,
        libraryVersions,
        ambiguities: [],
        summary: summarizeImportPlan({ plan, wordLists: loaded, mode })
    };
};

export const issueImportPreviewToken = ({ schoolId, user, operationHash, digest }) => createPreviewToken({
    school: String(schoolId),
    actor: String(user?._id || ''),
    operationHash,
    state: digest,
    kind: 'import'
});

export const libraryOperationId = freshOperationId;
