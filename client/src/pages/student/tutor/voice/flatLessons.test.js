import assert from 'node:assert/strict';
import test from 'node:test';
import { flatLessons } from './flatLessons.js';

const lesson = (id, lessonNumber, title) => ({ id, lessonNumber, title });

const outline = [
    {
        unitNumber: 1,
        unitTitle: 'Rivers',
        lessons: [lesson('u1l1', 1, 'The Nile'), lesson('u1l2', 2, 'The Amazon')],
        chapters: [
            {
                chapterNumber: 1,
                chapterTitle: 'Floods',
                lessons: [lesson('u1c1l1', 1, 'Nile floods')]
            }
        ]
    },
    {
        unitNumber: 2,
        unitTitle: 'Maps',
        lessons: [],
        chapters: [
            {
                chapterNumber: 1,
                chapterTitle: 'Scale',
                lessons: [lesson('u2c1l1', 1, 'Reading scale')]
            }
        ]
    }
];

test('every lesson is one flat list with unit and chapter headings', () => {
    const rows = flatLessons(outline);
    assert.deepEqual(rows.map((row) => row.kind), [
        'unit',
        'lesson',
        'lesson',
        'chapter',
        'lesson',
        'unit',
        'chapter',
        'lesson'
    ]);
    assert.deepEqual(rows.filter((row) => row.kind === 'lesson').map((row) => row.lesson.id), [
        'u1l1',
        'u1l2',
        'u1c1l1',
        'u2c1l1'
    ]);
    assert.equal(rows[0].count, 3);
    assert.equal(rows[5].count, 1);
    assert.equal(rows[3].chapterNumber, 1);
    assert.equal(rows[4].chapterNumber, 1);
});

test('a filter keeps matching lessons and the headings above them', () => {
    const rows = flatLessons(outline, 'nile');
    assert.deepEqual(rows.filter((row) => row.kind === 'lesson').map((row) => row.lesson.id), [
        'u1l1',
        'u1c1l1'
    ]);
    assert.equal(rows[0].kind, 'unit');
    assert.equal(rows[0].count, 2);
    assert.equal(rows.at(-1).kind, 'lesson');
    assert.equal(rows.some((row) => row.kind === 'unit' && row.unitNumber === 2), false);
});

test('a filter can find a lesson by its number', () => {
    const rows = flatLessons(outline, '2');
    assert.deepEqual(rows.filter((row) => row.kind === 'lesson').map((row) => row.lesson.id), ['u1l2']);
});

test('a filter with no match leaves an empty list, not a wall of headings', () => {
    assert.deepEqual(flatLessons(outline, 'volcano'), []);
});

test('missing or odd outlines are safe', () => {
    assert.deepEqual(flatLessons(), []);
    assert.deepEqual(flatLessons(null), []);
    assert.deepEqual(flatLessons([{ unitNumber: 1, unitTitle: 'Empty' }]), [
        { kind: 'unit', key: 'unit-1', unitNumber: 1, unitTitle: 'Empty', count: 0 }
    ]);
});
