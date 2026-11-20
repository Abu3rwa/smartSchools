import assert from 'node:assert/strict';
import test from 'node:test';
import {
    migrateSubjectCodeIndex,
    migrateSupportPlanIndexes,
    migrateSupportRespondentIndexes,
    migrateTeacherEmployeeIdIndex,
    migrateWritingDraftNumberIndex
} from '../config/db.js';

const createDatabase = (initialIndexes = []) => {
    const indexes = [...initialIndexes];
    const dropped = [];
    const created = [];
    const collection = {
        indexes: async () => [...indexes],
        dropIndex: async (name) => {
            dropped.push(name);
            const index = indexes.findIndex((item) => item.name === name);
            if (index !== -1) indexes.splice(index, 1);
        },
        createIndex: async (key, options) => {
            created.push({ key, options });
            indexes.push({ key, ...options });
        }
    };
    const db = {
        collection: () => collection,
        listCollections: () => ({ hasNext: async () => true })
    };
    return { db, indexes, dropped, created };
};

test('teacher employee ID migration replaces the global unique index with a school-scoped index', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        { name: 'employeeId_1', key: { employeeId: 1 }, unique: true }
    ]);

    await migrateTeacherEmployeeIdIndex(state.db);

    assert.deepEqual(state.dropped, ['employeeId_1']);
    assert.deepEqual(state.created, [{
        key: { school: 1, employeeId: 1 },
        options: { unique: true, name: 'school_1_employeeId_1' }
    }]);
});

test('teacher employee ID migration preserves an existing school-scoped unique index', async () => {
    const scopedIndex = {
        name: 'school_1_employeeId_1',
        key: { school: 1, employeeId: 1 },
        unique: true
    };
    const state = createDatabase([{ name: '_id_', key: { _id: 1 } }, scopedIndex]);

    await migrateTeacherEmployeeIdIndex(state.db);

    assert.deepEqual(state.dropped, []);
    assert.deepEqual(state.created, []);
});

test('subject code migration replaces the global unique index with a school-scoped index', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        { name: 'code_1', key: { code: 1 }, unique: true },
        { name: 'name_1', key: { name: 1 } }
    ]);

    await migrateSubjectCodeIndex(state.db);

    assert.deepEqual(state.dropped, ['code_1']);
    assert.deepEqual(state.created, [{
        key: { school: 1, code: 1 },
        options: { unique: true, name: 'school_1_code_1' }
    }]);
});

test('subject code migration drops only the global index when the school-scoped one exists', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        { name: 'code_1', key: { code: 1 }, unique: true },
        { name: 'school_1_code_1', key: { school: 1, code: 1 }, unique: true }
    ]);

    await migrateSubjectCodeIndex(state.db);

    assert.deepEqual(state.dropped, ['code_1']);
    assert.deepEqual(state.created, []);
});

test('subject code migration leaves a non-unique code index alone', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        { name: 'code_1', key: { code: 1 } },
        { name: 'school_1_code_1', key: { school: 1, code: 1 }, unique: true }
    ]);

    await migrateSubjectCodeIndex(state.db);

    assert.deepEqual(state.dropped, []);
    assert.deepEqual(state.created, []);
});

test('writing draft number migration rebuilds the unique index for live drafts only', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        { name: 'school_1_project_1_number_1', key: { school: 1, project: 1, number: 1 }, unique: true }
    ]);

    await migrateWritingDraftNumberIndex(state.db);

    assert.deepEqual(state.dropped, ['school_1_project_1_number_1']);
    assert.deepEqual(state.created, [{
        key: { school: 1, project: 1, number: 1 },
        options: {
            unique: true,
            name: 'school_1_project_1_number_1',
            partialFilterExpression: { withdrawn: false }
        }
    }]);
});

test('writing draft number migration keeps an index that already skips withdrawn drafts', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        {
            name: 'school_1_project_1_number_1',
            key: { school: 1, project: 1, number: 1 },
            unique: true,
            partialFilterExpression: { withdrawn: false }
        }
    ]);

    await migrateWritingDraftNumberIndex(state.db);

    assert.deepEqual(state.dropped, []);
    assert.deepEqual(state.created, []);
});

test('support respondent migration drops the legacy one-row-per-student unique index', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        { name: 'school_1_student_1', key: { school: 1, student: 1 }, unique: true },
        {
            name: 'one_parent_slot_per_student',
            key: { school: 1, student: 1, parentSlot: 1 },
            unique: true,
            partialFilterExpression: { kind: 'parent' }
        },
        {
            name: 'one_student_respondent',
            key: { school: 1, student: 1 },
            unique: true,
            partialFilterExpression: { kind: 'student' }
        }
    ]);

    await migrateSupportRespondentIndexes(state.db);

    assert.deepEqual(state.dropped, ['school_1_student_1']);
    assert.deepEqual(state.created, []);
    assert.ok(state.indexes.some((index) => index.name === 'one_parent_slot_per_student'));
    assert.ok(state.indexes.some((index) => index.name === 'one_student_respondent'));
});

test('support respondent migration drops a legacy-named index even when it is partial', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        {
            name: 'school_1_student_1',
            key: { school: 1, student: 1 },
            unique: true,
            partialFilterExpression: { kind: { $exists: true } }
        }
    ]);

    await migrateSupportRespondentIndexes(state.db);

    assert.deepEqual(state.dropped, ['school_1_student_1']);
});

test('support respondent migration leaves partial and non-unique indexes alone', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        { name: 'school_1_student_1', key: { school: 1, student: 1 } },
        {
            name: 'one_student_respondent',
            key: { school: 1, student: 1 },
            unique: true,
            partialFilterExpression: { kind: 'student' }
        }
    ]);

    await migrateSupportRespondentIndexes(state.db);

    assert.deepEqual(state.dropped, []);
    assert.deepEqual(state.created, []);
});

test('support respondent migration skips a database without the collection', async () => {
    const state = createDatabase([]);
    state.db.listCollections = () => ({ hasNext: async () => false });

    await migrateSupportRespondentIndexes(state.db);

    assert.deepEqual(state.dropped, []);
    assert.deepEqual(state.created, []);
});

test('support plan migration rebuilds the legacy cycle index for dated cycles only', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        { name: 'school_1_cycle_1', key: { school: 1, cycle: 1 }, unique: true }
    ]);

    await migrateSupportPlanIndexes(state.db);

    assert.deepEqual(state.dropped, ['school_1_cycle_1']);
    assert.deepEqual(state.created, [{
        key: { school: 1, cycle: 1 },
        options: {
            unique: true,
            name: 'school_1_cycle_1',
            partialFilterExpression: { cycle: { $type: 'objectId' } }
        }
    }]);
});

test('support plan migration replaces a non-unique legacy cycle index too', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        { name: 'school_1_cycle_1', key: { school: 1, cycle: 1 } }
    ]);

    await migrateSupportPlanIndexes(state.db);

    assert.deepEqual(state.dropped, ['school_1_cycle_1']);
    assert.equal(state.created.length, 1);
    assert.equal(state.created[0].options.name, 'school_1_cycle_1');
});

test('support plan migration keeps a cycle index that already skips null cycles', async () => {
    const state = createDatabase([
        { name: '_id_', key: { _id: 1 } },
        {
            name: 'school_1_cycle_1',
            key: { school: 1, cycle: 1 },
            unique: true,
            partialFilterExpression: { cycle: { $type: 'objectId' } }
        }
    ]);

    await migrateSupportPlanIndexes(state.db);

    assert.deepEqual(state.dropped, []);
    assert.deepEqual(state.created, []);
});
