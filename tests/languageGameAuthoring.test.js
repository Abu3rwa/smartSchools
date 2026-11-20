import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import GameSkill from '../models/GameSkill.js';
import {
    ImportConflictError,
    revisionValue,
    saveWithRevision,
    slugKey,
    touchReferencedSkills,
    uniqueSlugKey
} from '../services/languageGameAuthoring.js';

const SCHOOL = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SKILL = 'cccccccccccccccccccccccc';
const SKILL_2 = 'cccccccccccccccccccccccd';

const doc = (overrides = {}) => ({
    authoringRevision: 3,
    revision: 2,
    saves: [],
    save(options) { this.saves.push({ options, where: { ...this.$where } }); return Promise.resolve(this); },
    ...overrides
});

/* ------------------------------------------------------------------ */
/* Revision compare-and-set                                            */
/* ------------------------------------------------------------------ */

test('saveWithRevision bumps the counter and pins the loaded revision in $where', async () => {
    const pack = doc();
    await saveWithRevision(pack, { field: 'authoringRevision', schoolId: SCHOOL });
    assert.equal(pack.authoringRevision, 4);
    assert.deepEqual(pack.$where, { school: SCHOOL, authoringRevision: 3 });
});

test('an explicit expected revision overrides the loaded value', async () => {
    const pack = doc({ authoringRevision: 9 });
    await saveWithRevision(pack, { field: 'authoringRevision', expected: 4, schoolId: SCHOOL });
    assert.deepEqual(pack.$where, { school: SCHOOL, authoringRevision: 4 });
});

test('legacy documents without a counter match 0 or null', async () => {
    const pack = doc({ authoringRevision: undefined });
    assert.equal(revisionValue(pack, 'authoringRevision'), null);
    await saveWithRevision(pack, { field: 'authoringRevision', schoolId: SCHOOL });
    assert.equal(pack.authoringRevision, 1);
    assert.deepEqual(pack.$where.authoringRevision, { $in: [0, null] });
});

test('a lost compare-and-set becomes a 409 conflict, not a silent overwrite', async () => {
    const pack = doc({
        save: async () => { throw new mongoose.Error.DocumentNotFoundError({}); }
    });
    await assert.rejects(
        saveWithRevision(pack, { field: 'authoringRevision', schoolId: SCHOOL }),
        (error) => error instanceof ImportConflictError && error.status === 409 && error.code === 'REVISION_CONFLICT'
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