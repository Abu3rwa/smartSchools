import test from 'node:test';
import assert from 'node:assert/strict';
import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import { buildAssignmentProgressMap } from '../controllers/assignmentController.js';

const assignments = [
    { _id: 'assignment-1', class: { _id: 'class-1', name: 'Class 1' }, scope: 'class' },
    {
        _id: 'assignment-2',
        class: { _id: 'class-1', name: 'Class 1' },
        scope: 'selected_students',
        studentIds: ['student-1', 'student-3', 'student-inactive']
    },
    { _id: 'assignment-3', class: 'class-2', scope: 'class' },
    {
        _id: 'assignment-4',
        class: { _id: 'class-1', name: 'Class 1' },
        scope: 'class',
        excusedStudentIds: ['student-2']
    },
    {
        _id: 'assignment-5',
        class: { _id: 'class-1', name: 'Class 1' },
        scope: 'class',
        excusedStudentIds: ['student-2']
    }
];

const students = [
    { _id: 'student-1', currentClass: 'class-1' },
    { _id: 'student-2', currentClass: 'class-1' },
    { _id: 'student-3', currentClass: 'class-2' }
];

const grades = [
    { assignment: 'assignment-1', student: 'student-1' },
    { assignment: 'assignment-1', student: 'student-3' },
    { assignment: 'assignment-1', student: 'student-inactive' },
    { assignment: 'assignment-2', student: 'student-1' },
    { assignment: 'assignment-2', student: 'student-3' },
    { assignment: 'assignment-3', student: 'student-3' },
    { assignment: 'assignment-5', student: 'student-2' }
];

const mockProgressSources = (t) => {
    let studentFilter;
    t.mock.method(Student, 'find', (filter) => {
        studentFilter = filter;
        return {
            select: () => ({ lean: async () => students })
        };
    });
    t.mock.method(Grade, 'find', () => ({
        select: () => ({ lean: async () => grades })
    }));
    return () => studentFilter;
};

test('assignment list progress counts only active target students', async (t) => {
    const getStudentFilter = mockProgressSources(t);

    const progress = await buildAssignmentProgressMap({
        schoolId: 'school-1',
        assignments
    });

    assert.deepEqual(getStudentFilter().currentClass.$in, ['class-1', 'class-2']);
    assert.deepEqual(progress.get('assignment-1'), {
        studentCount: 2,
        gradedCount: 1,
        percent: 50
    });
    assert.deepEqual(progress.get('assignment-2'), {
        studentCount: 1,
        gradedCount: 1,
        percent: 100
    });
    assert.deepEqual(progress.get('assignment-3'), {
        studentCount: 1,
        gradedCount: 1,
        percent: 100
    });
    assert.deepEqual(progress.get('assignment-4'), {
        studentCount: 1,
        gradedCount: 0,
        percent: 0
    });
    assert.deepEqual(progress.get('assignment-5'), {
        studentCount: 2,
        gradedCount: 1,
        percent: 50
    });
});

test('assignment list progress handles empty lists without querying', async () => {
    const progress = await buildAssignmentProgressMap({
        schoolId: 'school-1',
        assignments: []
    });

    assert.equal(progress.size, 0);
});
