import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import Class from '../models/Class.js';
import Student from '../models/Student.js';
import {
    enrolledClassesAfterMove,
    findStaleSameGradeEnrollments,
    isSameGradeClassMove,
    removeStaleSameGradeEnrollments
} from '../helpers/classMoves.js';

const schoolId = new mongoose.Types.ObjectId();
const grade5A = new mongoose.Types.ObjectId();
const grade5B = new mongoose.Types.ObjectId();
const grade6A = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();

const classes = [
    { _id: grade5A, name: 'Grade 5-A', grade: 5, section: 'A' },
    { _id: grade5B, name: 'Grade 5-B', grade: 5, section: 'B' },
    { _id: grade6A, name: 'Grade 6-A', grade: 6, section: 'A' }
];

const chain = (value) => {
    const query = {
        select: () => query,
        limit: () => query,
        lean: async () => value
    };
    return query;
};

const stubClasses = (context, rows = classes) => {
    context.mock.method(Class, 'find', () => chain(rows));
};

test('a move inside the same grade is recognised', async (context) => {
    stubClasses(context);
    assert.equal(await isSameGradeClassMove(schoolId, grade5A, grade5B), true);
    assert.equal(await isSameGradeClassMove(schoolId, grade5A, grade6A), false);
});

test('a move that is not a same-grade move keeps the class list as it is', async (context) => {
    stubClasses(context);
    const student = { currentClass: grade5A, enrolledClasses: [grade5A, grade6A] };

    assert.equal(await enrolledClassesAfterMove({ schoolId, student, toClass: grade5A }), null);
    assert.equal(await enrolledClassesAfterMove({ schoolId, student, toClass: null }), null);
    assert.equal(await enrolledClassesAfterMove({ schoolId, student, toClass: grade6A }), null);
});

test('a same-grade move drops the class left and keeps the other grades', async (context) => {
    stubClasses(context);
    const student = {
        currentClass: grade5A,
        enrolledClasses: [grade5A, grade6A, grade5B]
    };

    const next = await enrolledClassesAfterMove({ schoolId, student, toClass: grade5B });
    assert.deepEqual(next?.map(String), [String(grade6A), String(grade5B)]);
});

test('a populated current class is handled the same way as a bare id', async (context) => {
    stubClasses(context);
    const student = {
        currentClass: { _id: grade5A, grade: 5 },
        enrolledClasses: [grade5A]
    };

    const next = await enrolledClassesAfterMove({ schoolId, student, toClass: grade5B });
    assert.deepEqual(next, [String(grade5B)]);
});

test('the stale class list scan reports only extra classes at the student grade', async (context) => {
    stubClasses(context);
    context.mock.method(Student, 'find', () => chain([
        // Left 5-A for 5-B and still carries 5-A.
        { _id: studentId, firstName: 'Om', lastName: 'Ali', studentId: 'S-1', currentClass: grade5B, enrolledClasses: [grade5A, grade5B] },
        // A second class at another grade is a real enrolment, not a leftover.
        { _id: new mongoose.Types.ObjectId(), firstName: 'Lee', lastName: 'Kim', currentClass: grade5B, enrolledClasses: [grade5B, grade6A] },
        // No class of its own.
        { _id: new mongoose.Types.ObjectId(), firstName: 'No', lastName: 'Class', currentClass: null, enrolledClasses: [grade5A] }
    ]));

    const rows = await findStaleSameGradeEnrollments({ schoolId });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Om Ali');
    assert.equal(rows[0].stale.length, 1);
    assert.equal(String(rows[0].stale[0].id), String(grade5A));
});

test('the stale class list scan needs no class lookup when nobody has a list', async (context) => {
    let classLookups = 0;
    context.mock.method(Class, 'find', () => {
        classLookups += 1;
        return chain(classes);
    });
    context.mock.method(Student, 'find', () => chain([]));

    assert.deepEqual(await findStaleSameGradeEnrollments({ schoolId }), []);
    assert.equal(classLookups, 0);
});

test('removing leftovers pulls only the classes reported', async (context) => {
    const updates = [];
    context.mock.method(Student, 'updateOne', (filter, update) => {
        updates.push({ filter, update });
        return { updatedOne: true, modifiedCount: 1 };
    });

    const changed = await removeStaleSameGradeEnrollments({
        schoolId,
        studentId,
        classIds: [grade5A, 'not-an-id']
    });

    assert.equal(changed, true);
    assert.equal(updates.length, 1);
    const pulled = updates[0].update.$pull.enrolledClasses.$in.map(String);
    assert.deepEqual(pulled, [String(grade5A)]);
});

test('nothing is written when there is no class to remove', async (context) => {
    let calls = 0;
    context.mock.method(Student, 'updateOne', () => {
        calls += 1;
        return { modifiedCount: 0 };
    });

    assert.equal(await removeStaleSameGradeEnrollments({ schoolId, studentId, classIds: [] }), false);
    assert.equal(calls, 0);
});
