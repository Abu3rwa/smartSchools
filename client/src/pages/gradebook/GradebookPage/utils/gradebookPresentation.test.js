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

test('the school maximum wins over the maximum of the recorded grades', () => {
    const { categoryScales } = processGradebookData({
        students,
        grades: [{ _id: 'g1', student: { _id: 's1' }, category: 'project', marks: 0, maxMarks: 20 }],
        categoryMaxMarks: { project: 30 }
    });

    // The catalog is the school's decision, not whichever maximum appears most often.
    assert.equal(categoryScales.Project, 30);
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

test('quiz grades with different maxima average on the configured scale', () => {
    const processed = processGradebookData({
        students,
        grades: [
            // A 12/18 formal spelling test sits in the same category as an 8/10 quiz.
            { _id: 'g1', student: { _id: 's1' }, category: 'quiz', marks: 12, maxMarks: 18 },
            { _id: 'g2', student: { _id: 's1' }, category: 'quiz', marks: 8, maxMarks: 10 }
        ]
    });

    assert.equal(processed.categoryScales.Quiz, 10);

    const csv = buildGradebookCsv({
        students,
        categories: processed.categories,
        categoryScales: processed.categoryScales,
        processedData: processed.data
    });

    assert.match(csv, /Quiz \(\/10\)/);
    // 66.7% and 80% average to 73.3%, shown out of ten like every other quiz.
    assert.match(csv, /"Amina Beji","7.33","7.33"/);
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
