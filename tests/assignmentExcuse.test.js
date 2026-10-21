import test from 'node:test';
import assert from 'node:assert/strict';
import Assignment from '../models/Assignment.js';
import Student from '../models/Student.js';
import Grade from '../models/Grade.js';
import { setAssignmentStudentExcuse } from '../controllers/assignmentController.js';

const assignment = {
    _id: 'assignment-1',
    school: 'school-1',
    class: 'class-1',
    status: 'published'
};

const invoke = async ({ body, studentRows = [{ _id: 'student-1' }], existingGrade = null } = {}, t) => {
    t.mock.method(Assignment, 'findOne', async () => assignment);
    t.mock.method(Student, 'find', () => ({
        select: () => ({ lean: async () => studentRows })
    }));
    t.mock.method(Grade, 'exists', async () => existingGrade);
    const updates = [];
    t.mock.method(Assignment, 'updateOne', async (filter, update) => {
        updates.push({ filter, update });
        return { acknowledged: true };
    });

    const response = { statusCode: 200, body: null };
    let resolveResponse;
    let rejectResponse;
    const responseDone = new Promise((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
    });
    response.status = function setStatus(code) { this.statusCode = code; return this; };
    response.json = function sendJson(payload) {
        this.body = payload;
        resolveResponse();
        return this;
    };

    await setAssignmentStudentExcuse(
        {
            params: { id: assignment._id },
            schoolId: 'school-1',
            user: { role: 'admin', _id: 'admin-1' },
            body
        },
        response,
        (error) => { rejectResponse(error); }
    );
    await responseDone;

    return { response, updates };
};

test('excusing a student adds them to excusedStudentIds', async (t) => {
    const { response, updates } = await invoke({
        body: { studentId: 'student-1', excused: true }
    }, t);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.data, { studentId: 'student-1', excused: true });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].update.$addToSet.excusedStudentIds, 'student-1');
});

test('undoing an excuse removes the student from excusedStudentIds', async (t) => {
    const { response, updates } = await invoke({
        body: { studentId: 'student-1', excused: false }
    }, t);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.data, { studentId: 'student-1', excused: false });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].update.$pull.excusedStudentIds, 'student-1');
});

test('a student with an existing grade cannot be excused', async (t) => {
    const { response, updates } = await invoke({
        body: { studentId: 'student-1', excused: true },
        existingGrade: { _id: 'grade-1' }
    }, t);

    assert.equal(response.statusCode, 409);
    assert.match(response.body.message, /already has a grade/i);
    assert.equal(updates.length, 0);
});

test('students outside the assignment target cannot be excused', async (t) => {
    const { response, updates } = await invoke({
        body: { studentId: 'student-2', excused: true }
    }, t);

    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /not part of this assignment/i);
    assert.equal(updates.length, 0);
});
