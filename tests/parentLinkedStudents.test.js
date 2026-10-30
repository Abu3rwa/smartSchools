import assert from 'node:assert/strict';
import test from 'node:test';
import Student from '../models/Student.js';
import PlpStudentRecord from '../models/PlpStudentRecord.js';
import PlpEvidence from '../models/PlpEvidence.js';
import PlpGoal from '../models/PlpGoal.js';
import PlpTask from '../models/PlpTask.js';
import {
    getParentChildPlpReport,
    getParentLinkedStudents,
    getParentLinkedStudentById,
} from '../services/parentDashboardService.js';

const parentUser = { email: 'Parent@Example.com ' };

const chain = (rows, observer) => ({
    select() { return this; },
    populate() { return this; },
    sort(spec) { if (observer) observer.sort = spec; return this; },
    lean: async () => rows,
});

const stubStudentQueries = (t, { byYear = {}, newestYears = [] } = {}) => {
    const filters = [];
    t.mock.method(Student, 'find', (filter) => {
        filters.push(filter);
        const rows = filter.academicYear ? (byYear[filter.academicYear] || []) : [];
        return chain(rows);
    });
    t.mock.method(Student, 'distinct', async () => newestYears);
    return filters;
};

test('linked children come from the requested year when it has records', async (t) => {
    const filters = stubStudentQueries(t, {
        byYear: { '2026-2027': [{ firstName: 'Test', lastName: 'Student' }] },
        newestYears: ['2025-2026', '2026-2027'],
    });

    const rows = await getParentLinkedStudents({
        schoolId: 'school-1',
        parentUser,
        academicYear: '2026-2027',
    });

    assert.equal(rows.length, 1);
    assert.equal(filters.length, 1);
    assert.equal(filters[0].$or[0]['parentInfo.fatherEmail'].test('parent@example.com'), true);
});

test('a year-label mismatch falls back to the newest year the family has a record in', async (t) => {
    const filters = stubStudentQueries(t, {
        byYear: { '2025-2026': [{ firstName: 'Test', lastName: 'Student' }] },
        newestYears: ['2024-2025', '2025-2026'],
    });

    const rows = await getParentLinkedStudents({
        schoolId: 'school-1',
        parentUser,
        academicYear: '2026-2027',
    });

    assert.equal(rows.length, 1);
    assert.equal(filters.length, 2);
    assert.equal(filters[1].academicYear, '2025-2026');
});

test('the by-id lookup is scoped by school and parent email, not the year label', async (t) => {
    let captured = null;
    t.mock.method(Student, 'findOne', (filter) => {
        captured = filter;
        return chain({ firstName: 'Test', lastName: 'Student' });
    });

    const student = await getParentLinkedStudentById({
        schoolId: 'school-1',
        parentUser,
        academicYear: '2026-2027',
        childId: 'student-1',
    });

    assert.equal(student.firstName, 'Test');
    assert.equal(captured.school, 'school-1');
    assert.equal(captured.academicYear, undefined);
    assert.ok(captured.$or);
});

test('the character report falls back to the newest year with portfolio records', async (t) => {
    t.mock.method(Student, 'findOne', () => chain({ _id: 'student-1', firstName: 'Test', lastName: 'Student' }));
    const yearsRequested = [];
    t.mock.method(PlpStudentRecord, 'find', (filter) => {
        yearsRequested.push(filter.academicYear);
        return chain(filter.academicYear === '2025-2026' ? [{ _id: 'record-1' }] : []);
    });
    const fallbackQuery = {};
    t.mock.method(PlpStudentRecord, 'findOne', () => chain({ academicYear: '2025-2026' }, fallbackQuery));
    t.mock.method(PlpEvidence, 'find', () => chain([]));
    t.mock.method(PlpGoal, 'find', () => chain([]));
    t.mock.method(PlpTask, 'find', () => chain([]));

    const report = await getParentChildPlpReport({
        schoolId: 'school-1',
        parentUser,
        academicYear: '2026-2027',
        childId: 'student-1',
    });

    assert.equal(report.academicYear, '2025-2026');
    assert.deepEqual(yearsRequested, ['2026-2027', '2025-2026']);
    assert.deepEqual(fallbackQuery.sort, { academicYear: -1, updatedAt: -1 });
});
