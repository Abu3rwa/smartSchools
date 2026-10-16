import test from 'node:test';
import assert from 'node:assert/strict';
import { getSpellingAssessmentCoverage, resolveSpellingCompletionRecipients } from '../services/spellingEmailService.js';

test('spelling completion recipients honor each audience', () => {
    const student = {
        getAllContactEmailEntries: () => [
            { email: 'student@school.test', type: 'student' },
            { email: 'father@school.test', type: 'father' },
            { email: 'mother@school.test', type: 'mother' },
            { email: 'student@school.test', type: 'student' }
        ]
    };

    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'none'), []);
    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'student-only'), ['student@school.test']);
    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'parents-only'), ['father@school.test', 'mother@school.test']);
    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'student-and-parents'), [
        'student@school.test',
        'father@school.test',
        'mother@school.test'
    ]);
});

test('spelling completion recipients safely return no addresses without the model helper', () => {
    assert.deepEqual(resolveSpellingCompletionRecipients({}, 'student-and-parents'), []);
});

test('formal spelling email coverage includes every distinct grade, week, and category', () => {
    const coverage = getSpellingAssessmentCoverage([
        { grade: 'G4', week: 3, category: 'Animals' },
        { grade: 'G4', week: 12, category: 'Prefixes' },
        { grade: 'G4', week: 3, category: 'Animals' },
        { grade: 'G5', week: 2, category: 'Homophones' }
    ]);

    assert.deepEqual(coverage, {
        grades: ['G4', 'G5'],
        weeks: [2, 3, 12],
        categories: ['Animals', 'Homophones', 'Prefixes']
    });
});

test('formal spelling email coverage falls back to the selected quiz grade and week when attempts have no coverage', () => {
    assert.deepEqual(getSpellingAssessmentCoverage([], { fallbackGrade: 'G3', fallbackWeek: 4 }), {
        grades: ['G3'],
        weeks: [4],
        categories: []
    });
});
