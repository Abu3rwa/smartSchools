import assert from 'node:assert/strict';
import test from 'node:test';
import { mapGradesForSubmission, normalizeCustomCategory } from './gradeEntryPresentation.js';

test('custom categories are trimmed, lowercase and use single spaces', () => {
    assert.equal(normalizeCustomCategory('  Spelling   Bee  '), 'spelling bee');
    assert.equal(normalizeCustomCategory('  إملاء  '), 'إملاء');
    assert.equal(normalizeCustomCategory('   '), '');
    assert.equal(normalizeCustomCategory(null), '');
});

test('submission mapping keeps the existing mark and remark contract', () => {
    assert.deepEqual(mapGradesForSubmission({
        s1: { marks: '8.5', remarks: 'Clear work' },
        s2: { marks: '', remarks: 'Not entered' },
        s3: { marks: 0, remarks: '' }
    }), [
        { student: 's1', marks: 8.5, remarks: 'Clear work' },
        { student: 's3', marks: 0, remarks: '' }
    ]);
});
