import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createDraftStore,
    draftKey,
    indexKey,
    hasDraftContent,
    DRAFT_MAX_AGE_DAYS,
    DRAFT_VERSION
} from './gradeEntryDraft.js';

const createFakeStorage = ({ failWrites = false } = {}) => {
    const map = new Map();
    return {
        map,
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => {
            if (failWrites) throw new Error('QuotaExceededError');
            map.set(key, String(value));
        },
        removeItem: (key) => {
            map.delete(key);
        }
    };
};

const baseDraft = {
    classId: 'class-1',
    subjectId: 'subject-1',
    classLabel: 'Grade 5-Z',
    subjectLabel: 'ELA 5 (ELA)',
    category: 'Classwork',
    customCategory: '',
    date: '2026-11-24',
    maxMarks: 10,
    grades: { 'student-1': { marks: '8', remarks: '' } },
    lessonTitle: 'Fractions',
    lessonSummary: 'Halves and quarters.',
    pendingLesson: null,
    lessonPlanIds: ['plan-1'],
    sendNotifications: false
};

test('draft store round-trips a saved draft through the class and subject key', () => {
    const storage = createFakeStorage();
    const store = createDraftStore(storage);

    assert.equal(store.write('user-1', baseDraft), true);
    const restored = store.read('user-1', 'class-1', 'subject-1');

    assert.equal(restored.v, DRAFT_VERSION);
    assert.equal(restored.classId, 'class-1');
    assert.deepEqual(restored.grades, baseDraft.grades);
    assert.equal(restored.lessonTitle, 'Fractions');
    assert.ok(Number.isFinite(restored.savedAt));
});

test('draft store ignores and removes a draft written by another version', () => {
    const storage = createFakeStorage();
    const store = createDraftStore(storage);
    const key = draftKey('user-1', 'class-1', 'subject-1');
    storage.setItem(key, JSON.stringify({ ...baseDraft, v: 99, savedAt: Date.now() }));

    assert.equal(store.read('user-1', 'class-1', 'subject-1'), null);
    assert.equal(storage.map.has(key), false);
});

test('draft store ignores and removes corrupt JSON', () => {
    const storage = createFakeStorage();
    const store = createDraftStore(storage);
    const key = draftKey('user-1', 'class-1', 'subject-1');
    storage.setItem(key, '{"classId":');

    assert.equal(store.read('user-1', 'class-1', 'subject-1'), null);
    assert.equal(storage.map.has(key), false);
});

test('draft store drops drafts older than the age limit', () => {
    const storage = createFakeStorage();
    const store = createDraftStore(storage);
    const oldKey = draftKey('user-1', 'class-1', 'subject-1');
    const staleSavedAt = Date.now() - (DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) - 1000;
    storage.setItem(oldKey, JSON.stringify({ ...baseDraft, v: DRAFT_VERSION, savedAt: staleSavedAt }));

    assert.equal(store.read('user-1', 'class-1', 'subject-1'), null);
    assert.equal(storage.map.has(oldKey), false);
});

test('draft store refuses writes over the size cap without throwing', () => {
    const storage = createFakeStorage();
    const store = createDraftStore(storage);
    const hugeDraft = {
        ...baseDraft,
        lessonSummary: 'x'.repeat(260_000)
    };

    assert.equal(store.write('user-1', hugeDraft), false);
    assert.equal(store.read('user-1', 'class-1', 'subject-1'), null);
});

test('draft store reports a failing storage instead of throwing', () => {
    const storage = createFakeStorage({ failWrites: true });
    const store = createDraftStore(storage);

    assert.doesNotThrow(() => store.write('user-1', baseDraft));
    assert.equal(store.write('user-1', baseDraft), false);
});

test('draft index adds, removes and prunes entries', () => {
    const storage = createFakeStorage();
    const store = createDraftStore(storage);

    store.write('user-1', baseDraft);
    store.write('user-1', { ...baseDraft, subjectId: 'subject-2' });
    assert.equal(store.list('user-1').length, 2);

    store.remove('user-1', 'class-1', 'subject-1');
    assert.deepEqual(store.list('user-1').map((entry) => entry.subjectId), ['subject-2']);
    assert.equal(storage.map.has(draftKey('user-1', 'class-1', 'subject-1')), false);

    const index = JSON.parse(storage.getItem(indexKey('user-1')));
    index[0].savedAt = Date.now() - (DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) - 1000;
    storage.setItem(indexKey('user-1'), JSON.stringify(index));
    assert.deepEqual(store.prune('user-1'), []);
    assert.equal(storage.map.has(draftKey('user-1', 'class-1', 'subject-2')), false);
});

test('draft content check distinguishes marks-only and full drafts from an untouched page', () => {
    assert.equal(hasDraftContent({ grades: { a: { marks: '', remarks: '' } } }), false);
    assert.equal(hasDraftContent({ grades: { a: { marks: '7', remarks: '' } } }), true);
    assert.equal(hasDraftContent({ grades: { a: { marks: '', remarks: 'Needs help' } } }), true);
    assert.equal(hasDraftContent({ grades: {}, lessonSummary: 'Draft text' }), true);
    assert.equal(hasDraftContent(baseDraft), true);
});
