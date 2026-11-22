import test from 'node:test';
import assert from 'node:assert/strict';

import GamePack from '../models/GamePack.js';
import GameSkill from '../models/GameSkill.js';
import {
    archiveWithRevision,
    ImportConflictError,
    revisionValue,
    saveWithRevision,
    slugKey,
    touchReferencedSkills,
    uniqueSlugKey
} from '../services/languageGameAuthoring.js';

const SCHOOL = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const PACK_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const SKILL = 'cccccccccccccccccccccccc';
const SKILL_2 = 'cccccccccccccccccccccccd';

const packDoc = ({ revision, modified = { status: 'archived' } } = {}) => ({
    constructor: GamePack,
    _id: PACK_ID,
    authoringRevision: revision,
    modifiedPaths: () => Object.keys(modified),
    get: (path) => modified[path]
});

const mockUpdate = (t, result) => {
    const calls = [];
    t.mock.method(GamePack, 'findOneAndUpdate', async (filter, update, options) => {
        calls.push({ filter, update, options });
        return result;
    });
    return calls;
};

/* ------------------------------------------------------------------ */
/* Revision compare-and-set                                            */
/* ------------------------------------------------------------------ */

test('saveWithRevision writes only the changed paths and bumps the counter', async (t) => {
    const calls = mockUpdate(t, { _id: PACK_ID, authoringRevision: 4 });
    const saved = await saveWithRevision(packDoc({ revision: 3 }), { field: 'authoringRevision', schoolId: SCHOOL });
    assert.deepEqual(calls[0].filter, { _id: PACK_ID, school: SCHOOL, authoringRevision: 3 });
    assert.deepEqual(calls[0].update.$set, { status: 'archived', authoringRevision: 4 });
    assert.equal(calls[0].options.new, true);
    assert.equal(calls[0].options.runValidators, true);
    assert.equal(saved.authoringRevision, 4);
});

test('schema defaults on a legacy row are never written', async (t) => {
    const calls = mockUpdate(t, { _id: PACK_ID });
    await saveWithRevision(packDoc({ revision: 0 }), { field: 'authoringRevision', schoolId: SCHOOL });
    assert.deepEqual(Object.keys(calls[0].update.$set).sort(), ['authoringRevision', 'status']);
    assert.equal(calls[0].update.$inc, undefined);
});

test('an explicit expected revision overrides the loaded value', async (t) => {
    const calls = mockUpdate(t, { _id: PACK_ID });
    await saveWithRevision(packDoc({ revision: 9 }), { field: 'authoringRevision', expected: 4, schoolId: SCHOOL });
    assert.equal(calls[0].filter.authoringRevision, 4);
    assert.equal(calls[0].update.$set.authoringRevision, 10);
});

test('legacy documents without a counter match 0 or null', async (t) => {
    const calls = mockUpdate(t, { _id: PACK_ID });
    const pack = packDoc({ revision: undefined });
    assert.equal(revisionValue(pack, 'authoringRevision'), null);
    await saveWithRevision(pack, { field: 'authoringRevision', schoolId: SCHOOL });
    assert.deepEqual(calls[0].filter.authoringRevision, { $in: [0, null] });
    assert.equal(calls[0].update.$set.authoringRevision, 1);
});

test('a schema-defaulted counter of 0 also matches rows stored without one', async (t) => {
    const calls = mockUpdate(t, { _id: PACK_ID });
    await saveWithRevision(packDoc({ revision: 0 }), { field: 'authoringRevision', schoolId: SCHOOL });
    assert.deepEqual(calls[0].filter.authoringRevision, { $in: [0, null] });
    assert.equal(calls[0].update.$set.authoringRevision, 1);
});

test('the transaction session is passed to the write', async (t) => {
    const calls = mockUpdate(t, { _id: PACK_ID });
    const session = { id: 'session' };
    await saveWithRevision(packDoc({ revision: 1 }), { field: 'authoringRevision', schoolId: SCHOOL, session });
    assert.equal(calls[0].options.session, session);
});

test('a lost compare-and-set becomes a 409 conflict, not a silent overwrite', async (t) => {
    mockUpdate(t, null);
    await assert.rejects(
        saveWithRevision(packDoc({ revision: 2 }), { field: 'authoringRevision', schoolId: SCHOOL }),
        (error) => error instanceof ImportConflictError && error.status === 409 && error.code === 'REVISION_CONFLICT'
    );
});

/* ------------------------------------------------------------------ */
/* Archiving never depends on the loaded counter                      */
/* ------------------------------------------------------------------ */

test('archiveWithRevision archives a legacy row a stale counter would have blocked', async (t) => {
    const calls = mockUpdate(t, { _id: PACK_ID, status: 'archived', authoringRevision: 1 });
    const saved = await archiveWithRevision(packDoc({ revision: 0 }), { field: 'authoringRevision', schoolId: SCHOOL });
    assert.deepEqual(calls[0].filter, { _id: PACK_ID, school: SCHOOL });
    assert.deepEqual(calls[0].update.$set, { status: 'archived', authoringRevision: 1 });
    assert.equal(calls[0].options.new, true);
    assert.equal(saved.status, 'archived');
});

test('archiveWithRevision moves the counter forward and keeps the session', async (t) => {
    const calls = mockUpdate(t, { _id: PACK_ID });
    const session = { id: 'session' };
    await archiveWithRevision(packDoc({ revision: 5 }), { field: 'authoringRevision', schoolId: SCHOOL, session });
    assert.equal(calls[0].update.$set.authoringRevision, 6);
    assert.equal(calls[0].options.session, session);
});

test('archiveWithRevision reports a record that disappeared', async (t) => {
    mockUpdate(t, null);
    await assert.rejects(
        archiveWithRevision(packDoc({ revision: 0 }), { field: 'authoringRevision', schoolId: SCHOOL }),
        (error) => error instanceof ImportConflictError && error.status === 409
    );
});

/* ------------------------------------------------------------------ */
/* Skill reference guard                                               */
/* ------------------------------------------------------------------ */

test('touchReferencedSkills refuses when any skill is archived or missing', async (t) => {
    t.mock.method(GameSkill, 'updateMany', async () => ({ matchedCount: 1 }));
    await assert.rejects(
        touchReferencedSkills([SKILL, SKILL_2], { schoolId: SCHOOL }),
        (error) => error instanceof ImportConflictError && error.code === 'SKILL_UNAVAILABLE'
    );
});

test('touchReferencedSkills de-duplicates ids and skips empty lists', async (t) => {
    let calls = 0;
    let filter = null;
    t.mock.method(GameSkill, 'updateMany', async (query) => {
        calls += 1;
        filter = query;
        return { matchedCount: query._id.$in.length };
    });
    await touchReferencedSkills([], { schoolId: SCHOOL });
    assert.equal(calls, 0);
    await touchReferencedSkills([SKILL, SKILL, SKILL_2], { schoolId: SCHOOL });
    assert.equal(calls, 1);
    assert.equal(filter._id.$in.length, 2);
    assert.deepEqual(filter.status, { $ne: 'archived' });
    assert.equal(filter.school, SCHOOL);
});

/* ------------------------------------------------------------------ */
/* Machine keys                                                        */
/* ------------------------------------------------------------------ */

test('slugKey normalizes names and falls back when nothing survives', () => {
    assert.equal(slugKey('Prefixes and suffixes — Grade 5', 'fallback'), 'prefixes-and-suffixes-grade-5');
    assert.equal(slugKey('السابقة', 'fallback'), 'fallback');
    assert.equal(slugKey('', 'fallback'), 'fallback');
});

test('key collisions get a numeric suffix instead of failing the create', async (t) => {
    const seen = [];
    t.mock.method(GameSkill, 'findOne', (query) => {
        seen.push(query.key);
        const clash = seen.length < 3 ? { _id: SKILL } : null;
        return { select: () => ({ lean: async () => clash }) };
    });
    const key = await uniqueSlugKey(GameSkill, 'Prefix un-', { schoolId: SCHOOL });
    assert.equal(key, 'prefix-un-3');
    assert.deepEqual(seen, ['prefix-un', 'prefix-un-2', 'prefix-un-3']);
});