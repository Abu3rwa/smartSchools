import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSelfCheckPatch, isGradeRowEdited } from './selfCheckMarks.js';
import { toggleSelectedRuleId } from '../../../../components/grades/selfCheckSelection.js';

const rows = [
    { studentId: 's1', marks: 4, remarks: 'Completed classwork on time (+4)' },
    { studentId: 's2', marks: 2, remarks: 'Active participation & focus (+2)' }
];

test('toggling a rule adds it once and removes it again', () => {
    const once = toggleSelectedRuleId([], 'active-participation');
    assert.deepEqual(once, ['active-participation']);
    assert.deepEqual(toggleSelectedRuleId(once, 'active-participation'), []);
    assert.deepEqual(toggleSelectedRuleId(once, ''), once);
});

test('an untouched grid takes every submitted student', () => {
    const grades = { s1: { marks: '', remarks: '' }, s2: { marks: '', remarks: '' } };
    const { patch, updated, skipped, conflicts } = buildSelfCheckPatch({ rows, grades });
    assert.deepEqual(patch, {
        s1: { marks: 4, remarks: 'Completed classwork on time (+4)' },
        s2: { marks: 2, remarks: 'Active participation & focus (+2)' }
    });
    assert.equal(updated, 2);
    assert.equal(skipped, 0);
    assert.equal(conflicts, 0);
});

test('a row the teacher already typed into is kept unless overwrite is asked for', () => {
    const grades = { s1: { marks: '7', remarks: 'Nice work' }, s2: { marks: '', remarks: '' } };
    const kept = buildSelfCheckPatch({ rows, grades });
    assert.deepEqual(Object.keys(kept.patch), ['s2']);
    assert.equal(kept.conflicts, 1);
    assert.equal(kept.skipped, 1);

    const replaced = buildSelfCheckPatch({ rows, grades, overwrite: true });
    assert.deepEqual(replaced.patch.s1, { marks: 4, remarks: 'Completed classwork on time (+4)' });
    assert.equal(replaced.updated, 2);
});

test('a remark alone counts as teacher work and rows without a student are ignored', () => {
    assert.equal(isGradeRowEdited({ marks: '', remarks: 'Well done' }), true);
    assert.equal(isGradeRowEdited({ marks: 0, remarks: '' }), true);
    assert.equal(isGradeRowEdited(undefined), false);

    const { patch } = buildSelfCheckPatch({
        rows: [{ studentId: '', marks: 1, remarks: '' }, { studentId: 's3', marks: 0 }],
        grades: {}
    });
    assert.deepEqual(patch, { s3: { marks: 0, remarks: '' } });
});
