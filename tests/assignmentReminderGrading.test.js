import test from 'node:test';
import assert from 'node:assert/strict';
import Assignment from '../models/Assignment.js';
import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import notificationService from '../services/notificationService.js';
import { sendAssignmentReminder } from '../controllers/assignmentController.js';

const assignment = {
    _id: 'assignment-1',
    school: 'school-1',
    status: 'published',
    scope: 'class',
    class: 'class-1',
    title: 'Fractions practice',
    assignmentTypeName: 'Homework',
    dueDate: '2026-10-25T12:00:00.000Z'
};

const students = [
    { _id: 'student-graded', firstName: 'Gina', lastName: 'Graded' },
    { _id: 'student-pending', firstName: 'Pia', lastName: 'Pending' }
];

const invokeReminder = async ({ grades, audience = 'both' } = {}, t) => {
    t.mock.method(Assignment, 'findOne', async () => assignment);
    t.mock.method(Student, 'find', () => ({
        select: () => ({ lean: async () => students })
    }));
    t.mock.method(Grade, 'find', () => ({
        select: () => ({ lean: async () => grades })
    }));
    const parentCalls = [];
    const studentCalls = [];
    t.mock.method(notificationService, 'sendAssignmentReminderNotification', async (params) => {
        parentCalls.push(params);
        return [];
    });
    t.mock.method(notificationService, 'sendStudentAssignmentReminderNotification', async (params) => {
        studentCalls.push(params);
        return null;
    });

    const response = { statusCode: 200, body: null };
    let resolveResponse;
    let rejectResponse;
    const responseDone = new Promise((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
    });
    response.status = function setStatus(code) { this.statusCode = code; return this; };
    response.json = function sendJson(body) {
        this.body = body;
        resolveResponse();
        return this;
    };

    await sendAssignmentReminder(
        {
            params: { id: assignment._id },
            schoolId: 'school-1',
            user: { role: 'admin', _id: 'admin-1' },
            body: { audience }
        },
        response,
        (error) => { rejectResponse(error); }
    );
    await responseDone;

    return { response, parentCalls, studentCalls };
};

test('assignment reminders skip students who already have a grade', async (t) => {
    const { response, parentCalls, studentCalls } = await invokeReminder({
        grades: [{ student: 'student-graded' }]
    }, t);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.data, {
        studentCount: 1,
        gradedStudentCount: 1,
        remindersSent: 1,
        audience: 'both'
    });
    assert.deepEqual(parentCalls.map((call) => call.studentId), ['student-pending']);
    assert.deepEqual(studentCalls.map((call) => call.studentId), ['student-pending']);
});

test('assignment reminders are not sent when every student has been graded', async (t) => {
    const { response, parentCalls, studentCalls } = await invokeReminder({
        grades: [{ student: 'student-graded' }, { student: 'student-pending' }]
    }, t);

    assert.equal(response.statusCode, 409);
    assert.match(response.body.message, /already been graded/i);
    assert.equal(parentCalls.length, 0);
    assert.equal(studentCalls.length, 0);
});

test('assignment reminders still reach every ungraded student when none are graded', async (t) => {
    const { response, parentCalls, studentCalls } = await invokeReminder({ grades: [] }, t);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.studentCount, 2);
    assert.equal(response.body.data.gradedStudentCount, 0);
    assert.equal(parentCalls.length, 2);
    assert.equal(studentCalls.length, 2);
});
