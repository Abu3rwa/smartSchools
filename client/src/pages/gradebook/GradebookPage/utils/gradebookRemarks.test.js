import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNegativeRemarksText } from './gradebookRemarks.js';
import { splitRemarksBySentiment } from '../../../../utils/remarkSentiment.js';

const students = [
    { _id: 's1', firstName: 'Amina', lastName: 'Beji' },
    { _id: 's2', firstName: 'Omar', lastName: 'Haddad' }
];

test('remarks split into positive, negative and sentiment-free parts', () => {
    const { positives, negatives, others } = splitRemarksBySentiment(
        'Active participation (+2); Incomplete classwork (-2); Great effort (+1); Needs a sharper pencil'
    );

    assert.deepEqual(positives, ['Active participation (+2)', 'Great effort (+1)']);
    assert.deepEqual(negatives, ['Incomplete classwork (-2)']);
    assert.deepEqual(others, ['Needs a sharper pencil']);
});

test('the clipboard list carries only negative remarks, with student and assessment context', () => {
    const gradesByStudent = new Map([
        ['s1', [
            {
                _id: 'g1',
                category: 'Classwork',
                title: 'Fractions practice',
                date: '2026-10-12T08:00:00.000Z',
                remarks: 'Active participation (+2); Incomplete classwork (-2)'
            },
            {
                _id: 'g2',
                category: 'Classwork',
                title: 'Word problems',
                date: null,
                remarks: 'Great effort (+1)'
            },
            {
                _id: 'g3',
                category: 'Quiz',
                title: 'Spelling test',
                date: null,
                remarks: 'Off-task / Not working (-1)'
            }
        ]],
        ['s2', [
            {
                _id: 'g4',
                category: 'Classwork',
                title: '',
                date: null,
                remarks: 'Off-task / Not working (-1); helpful note'
            }
        ]]
    ]);

    const text = buildNegativeRemarksText({
        students,
        gradesByStudent,
        category: 'Classwork',
        title: 'Classwork — negative remarks',
        locale: 'en'
    });
    const lines = text.split('\n');

    assert.equal(lines[0], 'Classwork — negative remarks');
    assert.equal(lines.length, 3);
    assert.ok(lines[1].startsWith('Amina Beji (Fractions practice'));
    assert.ok(lines[1].endsWith('Incomplete classwork (-2)'));
    assert.equal(lines[2], 'Omar Haddad: Off-task / Not working (-1)');
    assert.doesNotMatch(text, /Active participation|Great effort|helpful note|Spelling test/);
});

test('a category without negative remarks produces no clipboard text', () => {
    const text = buildNegativeRemarksText({
        students,
        gradesByStudent: new Map([
            ['s1', [{ _id: 'g1', category: 'Quiz', title: '', date: null, remarks: 'Great effort (+1)' }]]
        ]),
        category: 'Quiz',
        title: 'Quiz — negative remarks',
        locale: 'en'
    });

    assert.equal(text, '');
});
