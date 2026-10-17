import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateTeacherEmployeeIdIndex } from '../config/db.js';

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
