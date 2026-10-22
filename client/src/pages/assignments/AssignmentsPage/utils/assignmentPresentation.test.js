import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getAvailableClasses, getAvailableSubjects } from './assignmentPresentation.js';

const myClasses = [
    { _id: 'ac1', class: { _id: 'c5t-2526', name: 'Grade 5-T', academicYear: '2025-2026' }, subject: { _id: 's-math', name: 'Math' } },
    { _id: 'ac2', class: { _id: 'c5t-2425', name: 'Grade 5-T', academicYear: '2024-2025' }, subject: { _id: 's-math', name: 'Math' } },
    { _id: 'ac3', class: { _id: 'c6a-2526', name: 'Grade 6-A', academicYear: '2025-2026' }, subject: { _id: 's-science', name: 'Science' } }
];
const classes = [
    { _id: 'c5t-2526', name: 'Grade 5-T', academicYear: '2025-2026' },
    { _id: 'c5t-2425', name: 'Grade 5-T', academicYear: '2024-2025' },
    { _id: 'c6a-2526', name: 'Grade 6-A', academicYear: '2025-2026' }
];

test('teacher class options stay inside the selected academic year', () => {
    const result = getAvailableClasses({
        userRole: 'teacher', myClasses, classes: [], academicYear: '2025-2026'
    });

    assert.deepEqual(result.map((item) => item._id), ['c5t-2526', 'c6a-2526']);
    assert.equal(result.every((item) => !item.optionLabel), true);
});

test('admin class options stay inside the selected academic year', () => {
    const result = getAvailableClasses({
        userRole: 'admin', myClasses: [], classes, academicYear: '2024-2025'
    });

    assert.deepEqual(result.map((item) => item._id), ['c5t-2425']);
});

test('repeated names are labelled with their year when no year scoping applies', () => {
    const result = getAvailableClasses({ userRole: 'admin', myClasses: [], classes });

    assert.deepEqual(result.map((item) => item.optionLabel || item.name), [
        'Grade 5-T (2025-2026)',
        'Grade 5-T (2024-2025)',
        'Grade 6-A'
    ]);
});

test('a year that matches nothing keeps the full list instead of emptying the select', () => {
    const result = getAvailableClasses({
        userRole: 'teacher', myClasses, classes: [], academicYear: '2030-2031'
    });

    assert.deepEqual(result.map((item) => item._id), ['c5t-2526', 'c5t-2425', 'c6a-2526']);
});

test('subjects are not duplicated once the class is year-scoped', () => {
    const result = getAvailableSubjects({
        userRole: 'teacher',
        selectedClass: 'c5t-2526',
        myClasses,
        classes: [],
        subjects: []
    });

    assert.deepEqual(result.map((item) => item._id), ['s-math']);
});
