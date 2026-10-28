import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildDefaultColumns,
    buildDefaultProfile,
    buildExportRequest,
    filenameFromDisposition,
    gradeLevelLabel,
    semesterNameFor
} from './quickSchoolsExport.js';

const categories = [
    { key: 'classwork', label: 'Classwork', defaultMaxMarks: null },
    { key: 'homework', label: 'Homework', defaultMaxMarks: 15 },
    { key: 'quiz', label: 'Quiz', defaultMaxMarks: null },
    { key: 'midterm_exam', label: 'Midterm Exam', defaultMaxMarks: null }
];

test('columns start enabled for the categories the month actually has', () => {
    const columns = buildDefaultColumns({
        categories,
        categoryMaxMarks: { quiz: 20 },
        grades: [
            { category: 'classwork', gradeType: 'classwork' },
            { category: 'classwork', gradeType: 'daily' },
            { category: 'quiz', gradeType: 'quiz' }
        ],
        today: new Date('2026-10-27T00:00:00Z')
    });

    assert.deepEqual(columns.map((column) => column.sourceType), ['classwork', 'homework', 'quiz', 'midterm_exam']);
    assert.equal(columns.find((column) => column.sourceType === 'classwork').enabled, true);
    assert.equal(columns.find((column) => column.sourceType === 'homework').enabled, false);
    assert.equal(columns.find((column) => column.sourceType === 'quiz').enabled, true);
    assert.equal(columns.find((column) => column.sourceType === 'midterm_exam').enabled, false);
});

test('with no grades loaded, classwork and homework start enabled', () => {
    const columns = buildDefaultColumns({ categories, grades: [], today: new Date('2026-10-27T00:00:00Z') });
    assert.equal(columns.find((column) => column.sourceType === 'classwork').enabled, true);
    assert.equal(columns.find((column) => column.sourceType === 'homework').enabled, true);
    assert.equal(columns.find((column) => column.sourceType === 'quiz').enabled, false);
});

test('column defaults use the school total, then the built-in one', () => {
    const columns = buildDefaultColumns({
        categories,
        categoryMaxMarks: { quiz: 20 },
        grades: [],
        today: new Date('2026-10-27T00:00:00Z')
    });

    assert.equal(columns.find((column) => column.sourceType === 'homework').totalMarks, 15);
    assert.equal(columns.find((column) => column.sourceType === 'quiz').totalMarks, 20);
    assert.equal(columns.find((column) => column.sourceType === 'midterm_exam').totalMarks, 25);
    assert.equal(columns.find((column) => column.sourceType === 'classwork').totalMarks, 10);
});

test('column names carry a month token and QuickSchools category defaults', () => {
    const columns = buildDefaultColumns({ categories, grades: [], today: new Date('2026-10-27T00:00:00Z') });

    assert.equal(columns[0].columnName, 'Classwork ({MMM})');
    assert.equal(columns[0].category, 'Activities');
    assert.equal(columns[1].category, 'Assignment');
    assert.equal(columns[3].category, 'Midterms');
    assert.equal(columns[0].dateRule, 'fixed');
    assert.equal(columns[0].fixedDate, '2026-10-27');
});

test('the default profile states the semester the way QuickSchools expects', () => {
    const profile = buildDefaultProfile({
        className: 'Grade 5-R',
        subjectName: 'Social Studies',
        subjectCode: 'SS 5R',
        classGrade: 5,
        academicYear: '2026-2027',
        semester: 1,
        semesters: [{ number: 1, label: 'Semester 1' }],
        categories,
        grades: []
    });

    assert.equal(profile.subjectValue, 'SS 5R');
    assert.equal(profile.gradeLevel, '5th Grade');
    assert.equal(profile.semesterName, '2026-2027, Semester 1');
    assert.equal(profile.name, 'SS 5R — Grade 5-R');
    assert.equal(profile.nameSource, 'externalName');
    assert.equal(profile.columns.length, categories.length);
});

test('semester names fall back to a plain label', () => {
    assert.equal(semesterNameFor('2026-2027', 2, []), '2026-2027, Semester 2');
    assert.equal(semesterNameFor('2026-2027', 2, [{ number: 2, label: 'Spring Term' }]), '2026-2027, Spring Term');
    assert.equal(semesterNameFor('2026-2027', null, []), '2026-2027');
});

test('grade levels are spelled out', () => {
    assert.equal(gradeLevelLabel(5), '5th Grade');
    assert.equal(gradeLevelLabel(12), '12th Grade');
    assert.equal(gradeLevelLabel(null), '');
});

test('the request carries the ids and drops empty date filters', () => {
    const request = buildExportRequest({
        profile: {
            semester: 1,
            subjectValue: 'SS 5R',
            gradeLevel: '5th Grade',
            semesterName: '2026-2027, Semester 1',
            columns: [],
            nameSource: 'externalName',
            skipEmpty: true,
            roundTo: 2
        },
        classId: 'class-1',
        subjectId: 'subject-1',
        academicYear: '2026-2027'
    });

    assert.equal(request.profile.classId, 'class-1');
    assert.equal(request.profile.subjectId, 'subject-1');
    assert.equal(request.profile.academicYear, '2026-2027');
    assert.equal(request.dateFrom, null);
    assert.equal(request.dateTo, null);
});

test('the file name comes back from the download header', () => {
    assert.equal(
        filenameFromDisposition("attachment; filename=\"SS_5R_Grade_5_R_gradebook_import_Classwork_Oct.xlsx\"; filename*=UTF-8''SS_5R_Grade_5_R_gradebook_import_Classwork_Oct.xlsx"),
        'SS_5R_Grade_5_R_gradebook_import_Classwork_Oct.xlsx'
    );
    assert.equal(
        filenameFromDisposition("attachment; filename=\"plain.xlsx\""),
        'plain.xlsx'
    );
    assert.equal(filenameFromDisposition(''), '');
});
