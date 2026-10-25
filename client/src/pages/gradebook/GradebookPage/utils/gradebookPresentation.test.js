import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGradebookCsv } from './gradebookCsvExport.js';
import { processGradebookData } from './gradebookPresentation.js';

const students = [{ _id: 's1', firstName: 'Amina', lastName: 'Beji' }];

test('an exam marked out of 25 reports its average out of 25', () => {
    const { categoryScales } = processGradebookData({
        students,
        grades: [
            { _id: 'g1', student: { _id: 's1' }, category: 'exam', marks: 20, maxMarks: 25 },
            { _id: 'g2', student: { _id: 's1' }, category: 'classwork', marks: 8, maxMarks: 10 }
        ]
    });

    assert.equal(categoryScales.Exam, 25);
    assert.equal(categoryScales.Classwork, 10);
});

test('a category with no recorded grades still uses the school default', () => {
    const { categoryScales } = processGradebookData({
        students,
        grades: [{ _id: 'g1', student: { _id: 's1' }, category: 'project', marks: 0, maxMarks: 20 }],
        categoryMaxMarks: { project: 30 }
    });

    // The recorded maximum wins because that is what the teacher entered against.
    assert.equal(categoryScales.Project, 20);
});

test('the school default applies when the recorded marks carry no usable maximum', () => {
    const { categoryScales } = processGradebookData({
        students,
        grades: [{ _id: 'g1', student: { _id: 's1' }, category: 'homework', marks: 5, maxMarks: null }],
        categoryMaxMarks: { homework: 15 }
    });

    assert.equal(categoryScales.Homework, 15);
});

test('an unknown category with no configured default falls back to ten', () => {
    const { categoryScales } = processGradebookData({
        students,
        grades: [{ _id: 'g1', student: { _id: 's1' }, category: 'oral', marks: 4, maxMarks: 0 }]
    });

    assert.equal(categoryScales.Oral, 10);
});

test('exported columns are labelled with the scale their averages use', () => {
    const processed = processGradebookData({
        students,
        grades: [{ _id: 'g1', student: { _id: 's1' }, category: 'exam', marks: 20, maxMarks: 25 }]
    });

    const csv = buildGradebookCsv({
        students,
        categories: processed.categories,
        categoryScales: processed.categoryScales,
        processedData: processed.data
    });

    assert.match(csv, /Exam \(\/25\)/);
    // 80% of a 25-mark exam is 20, not 8.
    assert.match(csv, /"Amina Beji","20","8"/);
});
