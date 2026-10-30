import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

/*
 * A writing task belongs to one class. "Selected students" is a subset of that
 * class, so a stale roster or a hand-written request can never turn a task into
 * a cross-class mailing list.
 */

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');
const SERVICE = '../services/writingAssistantService.js';
const MODEL = '../models/WritingAssignment.js';

test('the audience mode is explicit on the assignment', async () => {
    const model = await read(MODEL);
    assert.match(model, /audienceMode:\s*\{\s*type:\s*String,\s*enum:\s*\['class',\s*'selected'\]/);
});

test('selected students must already be active on the chosen class', async () => {
    const source = await read(SERVICE);
    assert.match(source, /currentClass:\s*classId/, 'the roster query must pin the class');
    assert.match(source, /Some selected students are not active in this class/);
    assert.match(source, /Choose a class before selecting students/);
});

test('a learning goal cannot name a student outside the audience', async () => {
    const source = await read(SERVICE);
    assert.match(source, /assertGoalsInAudience/, 'goals must be checked against the roster');
    assert.match(source, /A learning goal names a student who is not part of this task/);
});

test('the mode is derived from the payload, not inferred from the roster size', async () => {
    const { audienceModeFor } = await import(SERVICE);
    assert.equal(audienceModeFor({}), 'class');
    assert.equal(audienceModeFor({ audienceMode: 'class', studentIds: ['s1'] }), 'class');
    assert.equal(audienceModeFor({ studentIds: ['s1'] }), 'selected');
    assert.equal(audienceModeFor({ audienceMode: 'selected' }), 'selected');
    assert.equal(audienceModeFor({ studentIds: [] }), 'class');
});
