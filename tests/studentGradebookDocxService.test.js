import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildStudentGradebookDocx,
    GRADEBOOK_COLUMN_WIDTHS_DXA,
    GRADEBOOK_CONTENT_WIDTH_DXA
} from '../services/studentGradebookDocxService.js';

test('student gradebook DOCX uses fixed table widths across the printable page', async () => {
    assert.equal(GRADEBOOK_COLUMN_WIDTHS_DXA.reduce((total, width) => total + width, 0), GRADEBOOK_CONTENT_WIDTH_DXA);
    assert.deepEqual(GRADEBOOK_COLUMN_WIDTHS_DXA, [1240, 1640, 1160, 800, 1000, 3186]);

    const buffer = await buildStudentGradebookDocx({
        student: { firstName: 'Amina', lastName: 'Khan', studentId: 'STU-1' },
        grades: [{
            _id: 'grade-1',
            date: '2026-09-01',
            subject: { name: 'English' },
            gradeType: 'quiz',
            marks: 8,
            maxMarks: 10,
            remarks: 'A clear and detailed remark.'
        }],
        filters: { subject: true, subjectName: 'English' },
        locale: 'en'
    });

    assert.equal(buffer.subarray(0, 2).toString(), 'PK');
    assert.ok(buffer.length > 1000);
});
