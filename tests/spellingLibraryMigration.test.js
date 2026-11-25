import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SpellingLibraryMigrationRun from '../models/SpellingLibraryMigrationRun.js';
import SpellingLibraryState from '../models/SpellingLibraryState.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingWordProgress from '../models/SpellingWordProgress.js';
import { buildMigrationPlan, runMigration } from '../services/spellingLibraryMigrationService.js';
import { gradeNeedsProgressMigration } from '../services/spellingProgressService.js';
import { projectCompletion } from '../services/spellingTraversal.js';

const oid = () => new mongoose.Types.ObjectId();

const clone = (value) => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    if (value.constructor?.name === 'ObjectId') return new mongoose.Types.ObjectId(String(value));
    if (value instanceof Date) return new Date(value.getTime());
    const copy = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = clone(entry);
    return copy;
};

const defineSave = (doc) => {
    Object.defineProperty(doc, 'save', {
        value: async () => doc,
        enumerable: false,
        writable: true
    });
    return doc;
};

const chain = (value) => {
    const api = {
        session() {
            return api;
        },
        select() {
            return api;
        },
        sort() {
            return api;
        },
        limit() {
            return api;
        },
        lean: async () => value,
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
    };
    return api;
};

const applyStudentUpdate = ({ db, filter, update }) => {
    const student = db.students.find((entry) => String(entry._id) === String(filter._id));
    if (!student) return { matchedCount: 0, modifiedCount: 0 };
    let matched = true;
    if (filter['spelling.progressByGrade.grade'] !== undefined) {
        matched = Boolean((student.spelling.progressByGrade || [])
            .find((entry) => entry.grade === filter['spelling.progressByGrade.grade']));
    }
    if (!matched) return { matchedCount: 0, modifiedCount: 0 };

    for (const [path, value] of Object.entries(update.$set || {})) {
        if (path.includes('progressByGrade.$.')) {
            const grade = filter['spelling.progressByGrade.grade'] || student.spelling.currentGrade;
            const field = path.split('.$.').at(-1);
            const row = student.spelling.progressByGrade.find((entry) => entry.grade === grade);
            if (row) row[field] = value;
            continue;
        }
        const parts = path.split('.');
        let cursor = student;
        for (const part of parts.slice(0, -1)) {
            cursor[part] = cursor[part] || {};
            cursor = cursor[part];
        }
        cursor[parts.at(-1)] = value;
    }
    if (update.$push?.['spelling.progressByGrade']) {
        student.spelling.progressByGrade = student.spelling.progressByGrade || [];
        student.spelling.progressByGrade.push({ ...update.$push['spelling.progressByGrade'] });
    }
    if (update.$pull?.['spelling.progressByGrade']) {
        const grade = update.$pull['spelling.progressByGrade'].grade;
        student.spelling.progressByGrade = (student.spelling.progressByGrade || [])
            .filter((entry) => entry.grade !== grade);
    }
    return { matchedCount: 1, modifiedCount: 1 };
};

const applyRunUpdate = ({ run, filter, update }) => {
    if (filter['entries.student'] !== undefined) {
        const entry = (run.entries || []).find(
            (item) => String(item.student) === String(filter['entries.student'])
        );
        if (!entry) return;
        for (const [path, value] of Object.entries(update.$set || {})) {
            entry[path.replace('entries.$.', '')] = value;
        }
        return;
    }
    Object.assign(run, update.$set || {});
};

const cloneDb = (db) => ({
    students: clone(db.students),
    words: clone(db.words),
    progress: clone(db.progress),
    sessions: clone(db.sessions),
    runs: clone(db.runs),
    state: clone(db.state)
});

const installDb = (t, seed) => {
    const db = {
        students: clone(seed.students || []),
        words: clone(seed.words || []),
        progress: clone(seed.progress || []),
        sessions: clone(seed.sessions || []),
        runs: clone(seed.runs || []),
        state: clone(seed.state || null)
    };
    const inserts = [];
    let failStudentId = null;

    t.mock.method(mongoose, 'startSession', async () => {
        let snapshot = null;
        return {
            withTransaction: async (callback) => {
                snapshot = cloneDb(db);
                try {
                    return await callback();
                } catch (error) {
                    Object.assign(db, snapshot);
                    throw error;
                }
            },
            endSession: async () => {}
        };
    });
    t.mock.method(Student, 'find', (filter) => chain(db.students.filter((student) => {
        if (filter.school !== undefined && String(student.school) !== String(filter.school)) return false;
        if (filter._id?.$in) return filter._id.$in.some((id) => String(id) === String(student._id));
        const grades = filter.$or || [];
        return grades.some((clause) => {
            if (clause['spelling.progressByGrade.grade'] !== undefined) {
                return (student.spelling.progressByGrade || [])
                    .some((entry) => entry.grade === clause['spelling.progressByGrade.grade']);
            }
            if (clause['spelling.currentGrade'] !== undefined) {
                return student.spelling.currentGrade === clause['spelling.currentGrade'];
            }
            return false;
        });
    })));
    t.mock.method(Student, 'findOne', (filter) => chain(
        db.students.find((student) => String(student._id) === String(filter._id)) || null
    ));
    t.mock.method(Student, 'updateOne', async (filter, update) => {
        if (failStudentId && String(filter._id) === String(failStudentId)) {
            throw new Error('student projection write failed');
        }
        return applyStudentUpdate({ db, filter, update });
    });
    t.mock.method(Student, 'countDocuments', async (filter) => db.students.filter((student) => (
        filter.school === undefined || String(student.school) === String(filter.school)
    )).length);
    t.mock.method(SpellingWord, 'find', (filter) => chain(db.words.filter((word) => (
        (filter.school === undefined || String(word.school) === String(filter.school))
        && (filter.grade === undefined || word.grade === filter.grade)
    ))));
    t.mock.method(SpellingWordProgress, 'find', (filter) => chain(db.progress.filter((row) => {
        if (filter.school !== undefined && String(row.school) !== String(filter.school)) return false;
        if (filter.grade !== undefined && row.grade !== filter.grade) return false;
        if (filter.student !== undefined && String(row.student) !== String(filter.student)) return false;
        if (filter.migrationRunId !== undefined
            && String(row.migrationRunId) !== String(filter.migrationRunId)) return false;
        return true;
    })));
    t.mock.method(SpellingWordProgress, 'insertMany', async (docs) => {
        for (const doc of docs) {
            db.progress.push(clone(doc));
            inserts.push(clone(doc));
        }
        return docs;
    });
    t.mock.method(SpellingWordProgress, 'deleteMany', async (filter) => {
        db.progress = db.progress.filter((row) => !(
            (filter.school === undefined || String(row.school) === String(filter.school))
            && (filter.student === undefined || String(row.student) === String(filter.student))
            && (filter.migrationRunId === undefined
                || String(row.migrationRunId) === String(filter.migrationRunId))
        ));
        return {};
    });
    t.mock.method(SpellingSession, 'find', (filter) => chain(filter.$or ? [] : db.sessions));
    t.mock.method(SpellingLibraryMigrationRun, 'findOne', (filter) => {
        const run = db.runs.find((entry) => {
            if (filter.runId !== undefined && entry.runId !== filter.runId) return false;
            if (filter.status?.$in && !filter.status.$in.includes(entry.status)) return false;
            if (typeof filter.status === 'string' && entry.status !== filter.status) return false;
            return true;
        });
        return chain(run ? defineSave(run) : null);
    });
    t.mock.method(SpellingLibraryMigrationRun, 'create', async ([doc]) => {
        const run = defineSave({
            ...clone(doc),
            runId: doc.runId || `run-${db.runs.length + 1}`,
            entries: clone(doc.entries || []),
            unresolved: clone(doc.unresolved || [])
        });
        db.runs.push(run);
        return [run];
    });
    t.mock.method(SpellingLibraryMigrationRun, 'updateOne', async (filter, update) => {
        const run = db.runs.find((entry) => (
            (filter.runId === undefined || entry.runId === filter.runId)
            && (filter.school === undefined || String(entry.school) === String(filter.school))
        ));
        if (run) applyRunUpdate({ run, filter, update });
        return {};
    });
    t.mock.method(SpellingLibraryState, 'findOneAndUpdate', async (filter, update) => {
        if (!db.state) {
            db.state = { grade: filter.grade, school: filter.school };
            Object.assign(db.state, update.$setOnInsert || {});
        }
        Object.assign(db.state, update.$set || {});
        return defineSave(db.state);
    });
    t.mock.method(SpellingLibraryState, 'findOne', () => chain(db.state ? defineSave(db.state) : null));

    return {
        db,
        inserts,
        failStudent(studentId) {
            failStudentId = studentId;
        },
        recover() {
            failStudentId = null;
        }
    };
};

const word = ({ school, grade = 'G1', week, order, text, id = oid(), deletedAt = null }) => ({
    _id: id,
    school,
    grade,
    week,
    order,
    word: text,
    normalizedWord: text.toLowerCase(),
    deletedAt
});

const student = ({ school, id = oid(), grade = 'G1', week = null, index = 0, floor = 1 }) => ({
    _id: id,
    school,
    spelling: {
        currentGrade: grade,
        currentWeek: week,
        lastWordIndex: index,
        traversalRevision: 0,
        progressByGrade: [{ grade, week, lastWordIndex: index, placementStartWeek: floor }]
    }
});

test('the plan trusts attempt history over the legacy pointer', () => {
    const school = oid();
    const words = [
        word({ school, week: 1, order: 1, text: 'alpha' }),
        word({ school, week: 1, order: 2, text: 'bravo' }),
        word({ school, week: 2, order: 1, text: 'charlie' }),
        word({ school, week: 3, order: 1, text: 'delta' })
    ];
    const learner = student({ school, week: 3, index: 1 });
    const attempts = [{
        student: learner._id,
        wordId: words[0]._id,
        wordSnapshot: 'alpha',
        week: 1,
        grade: 'G1',
        isRetest: false
    }];

    const plan = buildMigrationPlan({
        grade: 'G1',
        words,
        students: [learner],
        progressRows: [],
        attempts
    });

    assert.deepEqual(plan.entries[0].consumedIds, [String(words[0]._id)]);
    assert.equal(plan.counts.fromAttempts, 1);
    assert.equal(plan.counts.fromPosition, 0);
    assert.deepEqual(
        [plan.entries[0].after.week, plan.entries[0].after.lastWordIndex],
        [1, 1],
        'the pointer is never used to infer unconsumed identities'
    );
});

test('a dry run reports counts without touching progress or the projection', async (t) => {
    const school = oid();
    const words = [
        word({ school, week: 1, order: 1, text: 'alpha' }),
        word({ school, week: 1, order: 2, text: 'bravo' })
    ];
    const learner = student({ school, week: 1, index: 1 });
    const { db, inserts } = installDb(t, { students: [learner], words });

    const result = await runMigration({ schoolId: school, grade: 'G1', mode: 'dry-run' });

    assert.equal(result.status, 'dry-run');
    assert.equal(result.unresolvedCount, 0);
    assert.equal(db.runs.length, 1);
    assert.equal(db.runs[0].status, 'dry-run');
    assert.equal(inserts.length, 0);
    assert.equal(db.students[0].spelling.progressByGrade[0].lastWordIndex, 1);
    assert.equal(db.state, null);
});

test('a dangling attempt identity resolves by week and snapshot', async (t) => {
    const school = oid();
    const alpha = word({ school, week: 1, order: 1, text: 'alpha' });
    const learner = student({ school, week: 1, index: 0 });
    const { db } = installDb(t, {
        students: [learner],
        words: [alpha],
        sessions: [{
            student: learner._id,
            attempts: [{
                wordId: oid(),
                wordSnapshot: 'alpha',
                week: 1,
                grade: 'G1',
                isRetest: false
            }]
        }]
    });

    const result = await runMigration({ schoolId: school, grade: 'G1', mode: 'apply' });

    assert.equal(result.status, 'applied');
    assert.equal(result.counts.danglingResolved, 1);
    assert.deepEqual(
        db.progress.map((row) => String(row.wordId)),
        [String(alpha._id)]
    );
    assert.equal(db.state.migrationStatus, 'ready');
    assert.equal(db.state.progressSchemaVersion, 1);
});

test('an ambiguous dangling identity blocks the grade without writing progress', async (t) => {
    const school = oid();
    const learner = student({ school, week: 1, index: 0 });
    const { db, inserts } = installDb(t, {
        students: [learner],
        words: [
            word({ school, week: 1, order: 1, text: 'alpha' }),
            word({ school, week: 1, order: 2, text: 'ALPHA' })
        ],
        sessions: [{
            student: learner._id,
            attempts: [{
                wordId: oid(),
                wordSnapshot: 'Alpha',
                week: 1,
                grade: 'G1',
                isRetest: false
            }]
        }]
    });

    const result = await runMigration({ schoolId: school, grade: 'G1', mode: 'apply' });

    assert.equal(result.status, 'blocked');
    assert.equal(result.unresolvedCount, 1);
    assert.equal(inserts.length, 0);
    assert.equal(db.state.migrationStatus, 'blocked');
    assert.equal(db.state.progressSchemaVersion, 0);
});

test('an interrupted apply resumes once and never duplicates a student entry', async (t) => {
    const school = oid();
    const words = [
        word({ school, week: 1, order: 1, text: 'alpha' }),
        word({ school, week: 1, order: 2, text: 'bravo' })
    ];
    const first = student({ school, week: 1, index: 1 });
    const second = student({ school, week: 1, index: 1 });
    const harness = installDb(t, { students: [first, second], words });

    harness.failStudent(second._id);
    await assert.rejects(
        () => runMigration({ schoolId: school, grade: 'G1', mode: 'apply', runId: 'run-resume' }),
        /student projection write failed/
    );
    assert.equal(harness.db.progress.length, 1, 'only the first student committed');

    harness.recover();
    const resumed = await runMigration({ schoolId: school, grade: 'G1', mode: 'apply', runId: 'run-resume' });

    assert.equal(resumed.status, 'applied');
    assert.equal(harness.db.progress.length, 2);
    assert.equal(
        harness.db.progress.filter((row) => String(row.student) === String(first._id)).length,
        1,
        'the applied student is skipped on resume'
    );
    assert.equal(harness.db.progress.filter((row) => String(row.student) === String(second._id)).length, 1);
});

test('rollback restores the pre-migration projection and marks the grade unmigrated', async (t) => {
    const school = oid();
    const words = [
        word({ school, week: 1, order: 1, text: 'alpha' }),
        word({ school, week: 1, order: 2, text: 'bravo' })
    ];
    const learner = student({ school, week: 1, index: 1 });
    const { db } = installDb(t, { students: [learner], words });

    await runMigration({ schoolId: school, grade: 'G1', mode: 'apply', runId: 'run-rollback' });
    assert.equal(db.progress.length, 1);

    const result = await runMigration({ schoolId: school, grade: 'G1', mode: 'rollback', runId: 'run-rollback' });

    assert.equal(result.rolledBack, true);
    assert.equal(db.progress.length, 0);
    assert.equal(db.students[0].spelling.progressByGrade[0].week, 1);
    assert.equal(db.students[0].spelling.progressByGrade[0].lastWordIndex, 1);
    assert.equal(db.state.migrationStatus, 'ready');
    assert.equal(db.state.progressSchemaVersion, 0);
    assert.equal(db.runs[0].status, 'rolled-back');
});

test('rollback refuses once new consumption exists after the migration', async (t) => {
    const school = oid();
    const words = [
        word({ school, week: 1, order: 1, text: 'alpha' }),
        word({ school, week: 1, order: 2, text: 'bravo' })
    ];
    const learner = student({ school, week: 1, index: 1 });
    const { db } = installDb(t, { students: [learner], words });

    await runMigration({ schoolId: school, grade: 'G1', mode: 'apply', runId: 'run-drift' });
    // A live answer after the migration: a new consumed ID and a new projection.
    db.progress.push({
        school,
        student: learner._id,
        wordId: words[1]._id,
        grade: 'G1',
        source: 'attempt',
        migrationRunId: null
    });
    db.students[0].spelling.progressByGrade[0].lastWordIndex = 2;
    db.students[0].spelling.traversalRevision += 1;

    const result = await runMigration({ schoolId: school, grade: 'G1', mode: 'rollback', runId: 'run-drift' });

    assert.equal(result.rolledBack, false);
    assert.equal(result.conflicts.length, 1);
    assert.match(result.conflicts[0].reason, /progress advanced/);
    assert.equal(
        db.progress.filter((row) => String(row.migrationRunId) === 'run-drift').length,
        1,
        'run-scoped rows are kept when rollback is unsafe'
    );
});

test('verify reports a mismatch when a run ledger row disappears', async (t) => {
    const school = oid();
    const words = [
        word({ school, week: 1, order: 1, text: 'alpha' }),
        word({ school, week: 1, order: 2, text: 'bravo' })
    ];
    const learner = student({ school, week: 1, index: 1 });
    const { db } = installDb(t, { students: [learner], words });

    await runMigration({ schoolId: school, grade: 'G1', mode: 'apply', runId: 'run-verify' });
    db.progress = [];

    const result = await runMigration({ schoolId: school, grade: 'G1', mode: 'verify', runId: 'run-verify' });

    assert.equal(result.ready, false);
    assert.equal(result.mismatches.length, 1);
    assert.match(result.mismatches[0].reason, /no longer match/);
});

test('a half-migrated grade still needs the migration after a resume-able run', async (t) => {
    const school = oid();
    const words = [word({ school, week: 1, order: 1, text: 'alpha' })];
    const learner = student({ school, week: 1, index: 0 });
    const { db } = installDb(t, { students: [learner], words });

    await runMigration({ schoolId: school, grade: 'G1', mode: 'apply', runId: 'run-half' });
    assert.equal(await gradeNeedsProgressMigration({ schoolId: school, grade: 'G1' }), false);

    db.state.progressSchemaVersion = 0;
    assert.equal(await gradeNeedsProgressMigration({ schoolId: school, grade: 'G1' }), true);

    db.state.migrationStatus = 'blocked';
    assert.equal(await gradeNeedsProgressMigration({ schoolId: school, grade: 'G1' }), true);
});

test('the migration projection matches the shared traversal rule', () => {
    const school = oid();
    const words = [
        word({ school, week: 1, order: 1, text: 'alpha' }),
        word({ school, week: 1, order: 2, text: 'bravo' }),
        word({ school, week: 2, order: 1, text: 'charlie' })
    ];
    const learner = student({ school, week: 1, index: 0 });
    const plan = buildMigrationPlan({
        grade: 'G1',
        words,
        students: [learner],
        progressRows: [{ student: learner._id, wordId: words[0]._id }],
        attempts: []
    });

    assert.deepEqual(
        projectCompletion({
            words,
            consumedIds: plan.entries[0].consumedIds,
            floorWeek: 1
        }).lastWordIndex,
        plan.entries[0].after.lastWordIndex
    );
});
