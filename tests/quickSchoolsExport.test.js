import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

import {
    QUICK_SHEET_NAME,
    QUICK_SCHOOL_HEADERS,
    averageMark,
    buildExportRows,
    buildFileName,
    entryMatchesSource,
    gradeLevelLabel,
    pickEntryDate,
    resolveColumnName,
    roundMark
} from '../services/quickSchoolsExport.js';
import { applyOverrides, buildProfilePayload, writeWorkbook } from '../services/gradebookExportService.js';

const FIXED_DATE = new Date('2026-10-27T00:00:00.000Z');

const baseProfile = () => ({
    subjectValue: 'SS 5R',
    gradeLevel: '5th Grade',
    semesterName: '2026-2027, Semester 1',
    nameSource: 'externalName',
    skipEmpty: true,
    roundTo: 2,
    columns: [
        {
            sourceType: 'classwork',
            enabled: true,
            columnName: 'Classwork ({MMM})',
            category: 'Activities',
            totalMarks: 10,
            dateRule: 'fixed',
            fixedDate: FIXED_DATE
        },
        {
            sourceType: 'homework',
            enabled: true,
            columnName: 'Homework ({MMM})',
            category: 'Assignment',
            totalMarks: 10,
            dateRule: 'fixed',
            fixedDate: FIXED_DATE
        }
    ]
});

const students = () => [
    { _id: 's1', firstName: 'Aisha', lastName: 'Ezzurghi', externalName: 'Aisha Nuredden Ezzurghi' },
    { _id: 's2', firstName: 'Malik', lastName: 'Elamri', externalName: '' }
];

const entries = () => [
    { student: 's1', category: 'classwork', gradeType: 'classwork', date: new Date('2026-10-05T00:00:00Z'), marks: 8, maxMarks: 10 },
    { student: 's1', category: 'classwork', gradeType: 'daily', date: new Date('2026-10-12T00:00:00Z'), marks: 6, maxMarks: 20 },
    { student: 's1', category: 'homework', gradeType: 'homework', date: new Date('2026-10-20T00:00:00Z'), marks: 10, maxMarks: 10 },
    { student: 's2', category: 'homework', gradeType: 'homework', date: new Date('2026-10-21T00:00:00Z'), marks: 7, maxMarks: 10 }
];

test('the header row is the exact QuickSchools text, in order', () => {
    assert.deepEqual(QUICK_SCHOOL_HEADERS, [
        'Student Full Name',
        'Subject Name / Subject Code',
        'Assignment Name / Column Name',
        'Asignment Date',
        'Assignment Category / Column Category',
        'Marks',
        'Total Marks Possible',
        'Grade Level / Class Name',
        'Semester Name',
        'Final Grade (leave blank if not applicable)'
    ]);
    assert.equal(QUICK_SHEET_NAME, 'non-Final Grade import');
});

test('marks are rounded without floating point residue', () => {
    assert.equal(roundMark(9.779999999999999, 2), 9.78);
    assert.equal(roundMark(7, 2), 7);
    assert.equal(roundMark(7.235, 2), 7.24);
    assert.equal(roundMark(7.5, 0), 8);
});

test('grade levels read the way QuickSchools spells them', () => {
    assert.equal(gradeLevelLabel(5), '5th Grade');
    assert.equal(gradeLevelLabel(1), '1st Grade');
    assert.equal(gradeLevelLabel(2), '2nd Grade');
    assert.equal(gradeLevelLabel(3), '3rd Grade');
    assert.equal(gradeLevelLabel(11), '11th Grade');
    assert.equal(gradeLevelLabel(12), '12th Grade');
    assert.equal(gradeLevelLabel(21), '21st Grade');
    assert.equal(gradeLevelLabel(null), '');
});

test('column name tokens resolve from the row date', () => {
    assert.equal(resolveColumnName('Classwork ({MMM})', FIXED_DATE), 'Classwork (Oct)');
    assert.equal(resolveColumnName('{MMMM} {YYYY}', FIXED_DATE), 'October 2026');
    assert.equal(resolveColumnName('Quiz', FIXED_DATE), 'Quiz');
});

test('an average normalises entries marked out of different maximums', () => {
    const sample = [
        { marks: 8, maxMarks: 10 },
        { marks: 6, maxMarks: 20 }
    ];
    assert.equal(averageMark(sample, 10), 5.5);
    assert.equal(averageMark([{ marks: 9.78, maxMarks: 10 }], 10), 9.78);
});

test('entries without a mark are left out of the average, never counted as zero', () => {
    const sample = [
        { marks: 8, maxMarks: 10 },
        { marks: null, maxMarks: 10 },
        { marks: undefined, maxMarks: 10 },
        { marks: 6, maxMarks: 10 }
    ];
    assert.equal(averageMark(sample, 10), 7);
    assert.equal(averageMark([{ marks: null, maxMarks: 10 }], 10), null);
});

test('a column matches legacy grade types for the same category', () => {
    assert.equal(entryMatchesSource({ category: 'classwork', gradeType: 'daily' }, 'classwork'), true);
    assert.equal(entryMatchesSource({ category: 'test', gradeType: 'monthly_test' }, 'test'), true);
    assert.equal(entryMatchesSource({ category: 'homework', gradeType: 'homework' }, 'classwork'), false);
});

test('the fixed date rule wins, latest falls back to the newest entry', () => {
    const sample = [
        { date: new Date('2026-10-05T00:00:00Z') },
        { date: new Date('2026-10-12T00:00:00Z') }
    ];
    assert.equal(pickEntryDate({ dateRule: 'fixed', fixedDate: FIXED_DATE }, sample).toISOString(), FIXED_DATE.toISOString());
    assert.equal(pickEntryDate({ dateRule: 'latest' }, sample).toISOString(), '2026-10-12T00:00:00.000Z');
});

test('one row per student per column with the averages and fixed date', () => {
    const { rows, warnings, errors } = buildExportRows({
        profile: baseProfile(),
        students: students(),
        entries: entries()
    });

    assert.deepEqual(errors, []);
    assert.equal(rows.length, 3);

    const aishaClasswork = rows.find((row) => row.studentFullName === 'Aisha Nuredden Ezzurghi' && row.category === 'Activities');
    assert.equal(aishaClasswork.columnName, 'Classwork (Oct)');
    assert.equal(aishaClasswork.marks, 5.5);
    assert.equal(aishaClasswork.totalMarks, 10);
    assert.equal(aishaClasswork.subjectValue, 'SS 5R');
    assert.equal(aishaClasswork.gradeLevel, '5th Grade');
    assert.equal(aishaClasswork.semesterName, '2026-2027, Semester 1');
    assert.equal(aishaClasswork.finalGrade, null);
    assert.equal(aishaClasswork.date.toISOString(), FIXED_DATE.toISOString());

    // Malik has no QuickSchools name, so the app name is used and flagged.
    assert.ok(rows.some((row) => row.studentFullName === 'Malik Elamri'));
    assert.ok(warnings.some((warning) => warning.code === 'external_name_missing'));
});

test('a student with no data is skipped silently when skipEmpty is on', () => {
    const { rows } = buildExportRows({
        profile: baseProfile(),
        students: students(),
        entries: entries()
    });
    assert.equal(rows.filter((row) => row.studentFullName === 'Malik Elamri').length, 1);
});

test('skipEmpty off reports missing data once per column, not once per student', () => {
    const profile = { ...baseProfile(), skipEmpty: false };
    const { rows, warnings } = buildExportRows({ profile, students: students(), entries: entries() });

    assert.equal(rows.filter((row) => row.studentFullName === 'Malik Elamri').length, 1);
    const missing = warnings.filter((warning) => warning.code === 'student_without_data');
    assert.equal(missing.length, 1);
    assert.equal(missing[0].sourceType, 'classwork');
    assert.deepEqual(missing[0].students, ['Malik Elamri']);
});

test('nameSource fullName ignores the QuickSchools name', () => {
    const profile = { ...baseProfile(), nameSource: 'fullName' };
    const { rows, warnings } = buildExportRows({ profile, students: students(), entries: entries() });

    assert.ok(rows.every((row) => row.studentFullName !== 'Aisha Nuredden Ezzurghi'));
    assert.ok(rows.some((row) => row.studentFullName === 'Aisha Ezzurghi'));
    assert.equal(warnings.some((warning) => warning.code === 'external_name_missing'), false);
});

test('an empty subject blocks the export, a combined label only warns', () => {
    const missing = buildExportRows({
        profile: { ...baseProfile(), subjectValue: '  ' },
        students: students(),
        entries: entries()
    });
    assert.ok(missing.errors.some((error) => error.code === 'subject_required'));

    const combined = buildExportRows({
        profile: { ...baseProfile(), subjectValue: 'Social Studies 5 - SS 5R' },
        students: students(),
        entries: entries()
    });
    assert.equal(combined.errors.length, 0);
    assert.ok(combined.warnings.some((warning) => warning.code === 'subject_combined_label'));
});

test('a column without a name or category blocks the export', () => {
    const profile = baseProfile();
    profile.columns[0].columnName = '   ';
    profile.columns[1].category = '';
    const { errors } = buildExportRows({ profile, students: students(), entries: entries() });

    assert.ok(errors.some((error) => error.code === 'column_name_required'));
    assert.ok(errors.some((error) => error.code === 'category_required'));
});

test('two columns that produce the same student, name and date are rejected', () => {
    const profile = baseProfile();
    profile.columns[1] = {
        ...profile.columns[0],
        sourceType: 'homework',
        category: 'Activities'
    };
    const { errors } = buildExportRows({ profile, students: students(), entries: entries() });

    assert.ok(errors.some((error) => error.code === 'duplicate_row'));
});

test('a mark above its maximum is an error', () => {
    const broken = entries();
    broken[0] = { ...broken[0], marks: 11 };
    const { errors } = buildExportRows({ profile: baseProfile(), students: students(), entries: broken });

    assert.ok(errors.some((error) => error.code === 'marks_exceed_total'));
});

test('a date outside the semester warns once per column', () => {
    const profile = baseProfile();
    profile.columns.forEach((column) => {
        column.fixedDate = new Date('2026-12-15T00:00:00Z');
    });
    const { warnings } = buildExportRows({
        profile,
        students: students(),
        entries: entries(),
        semesterRange: { startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-10-31T00:00:00Z') }
    });

    const outside = warnings.filter((warning) => warning.code === 'date_outside_semester');
    assert.equal(outside.length, 2);
    assert.ok(outside.some((warning) => warning.column === 'Classwork (Dec)' && warning.count === 1));
    assert.ok(outside.some((warning) => warning.column === 'Homework (Dec)' && warning.count === 2));
});

test('overrides change one export without rewriting the profile', () => {
    const profile = baseProfile();
    const merged = applyOverrides(profile, {
        subjectValue: 'Social Studies 5',
        columns: [{ sourceType: 'homework', enabled: false, totalMarks: 20 }]
    });

    assert.equal(merged.subjectValue, 'Social Studies 5');
    assert.equal(merged.columns.find((column) => column.sourceType === 'homework').enabled, false);
    assert.equal(merged.columns.find((column) => column.sourceType === 'homework').totalMarks, 20);
    assert.equal(profile.columns.find((column) => column.sourceType === 'homework').enabled, true);
});

test('profile payloads are normalised before they reach the model', () => {
    const payload = buildProfilePayload({
        name: ' SS 5R October ',
        classId: 'c1',
        subjectId: 'sub1',
        academicYear: '2026-2027',
        semester: '1',
        subjectValue: ' SS 5R ',
        gradeLevel: '5th Grade',
        semesterName: '2026-2027, Semester 1',
        columns: [{ sourceType: 'ClassWork', enabled: 'x', columnName: ' Classwork ', category: 'Activities', totalMarks: '10', dateRule: 'anything' }],
        roundTo: 9
    });

    assert.equal(payload.name, 'SS 5R October');
    assert.equal(payload.semester, 1);
    assert.equal(payload.roundTo, 4);
    assert.equal(payload.columns[0].sourceType, 'classwork');
    assert.equal(payload.columns[0].enabled, true);
    assert.equal(payload.columns[0].totalMarks, 10);
    assert.equal(payload.columns[0].dateRule, 'fixed');
});

test('the file name follows Subject_Class_gradebook_import_Columns', () => {
    assert.equal(
        buildFileName({
            subjectValue: 'Social Studies 5R',
            className: 'Grade 5-R',
            columnNames: ['Classwork (Oct)', 'Homework (Oct)']
        }),
        'Social_Studies_5R_Grade_5_R_gradebook_import_Classwork_Oct_Homework_Oct.xlsx'
    );
});

test('the workbook round-trips with the right sheet, headers, and cell types', async () => {
    const profile = { ...baseProfile(), className: 'Grade 5-R' };
    const { rows } = buildExportRows({ profile, students: students(), entries: entries() });
    const { buffer, fileName } = await writeWorkbook(rows, profile);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet(QUICK_SHEET_NAME);
    assert.ok(sheet);
    assert.equal(sheet.rowCount, rows.length + 1);

    const header = sheet.getRow(1).values.slice(1);
    assert.deepEqual(header, QUICK_SCHOOL_HEADERS);

    const first = sheet.getRow(2);
    assert.equal(first.getCell(1).value, 'Aisha Nuredden Ezzurghi');
    assert.equal(first.getCell(2).value, 'SS 5R');
    assert.equal(first.getCell(3).value, 'Classwork (Oct)');
    assert.equal(first.getCell(4).value instanceof Date, true);
    assert.equal(first.getCell(4).value.toISOString().slice(0, 10), '2026-10-27');
    assert.equal(first.getCell(4).numFmt, 'mm-dd-yy');
    assert.equal(first.getCell(5).value, 'Activities');
    assert.equal(first.getCell(6).value, 5.5);
    assert.equal(first.getCell(7).value, 10);
    assert.equal(first.getCell(8).value, '5th Grade');
    assert.equal(first.getCell(9).value, '2026-2027, Semester 1');
    assert.equal(first.getCell(10).value, null);

    assert.ok(fileName.endsWith('_gradebook_import_Classwork_Oct_Homework_Oct.xlsx'));
});
