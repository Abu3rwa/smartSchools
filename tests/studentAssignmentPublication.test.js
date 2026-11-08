import test from 'node:test';
import assert from 'node:assert/strict';
import Assignment from '../models/Assignment.js';
import GrammarTest from '../models/GrammarTest.js';
import Student from '../models/Student.js';
import GoogleFormSubmission from '../models/GoogleFormSubmission.js';
import {
    getAssignmentAttachmentUrl,
    getMyAssignmentsForStudent
} from '../controllers/assignmentController.js';

const student = {
    _id: 'student-1',
    currentClass: 'class-1',
    academicYear: '2026/2027'
};

const chain = (value) => {
    const proxy = {
        populate: () => proxy,
        select: () => proxy,
        sort: () => proxy,
        lean: async () => value,
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
    };
    return proxy;
};

const makeResponse = () => {
    const response = { statusCode: 200, body: null };
    let resolveDone;
    let rejectDone;
    response.done = new Promise((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
    });
    response.status = function setStatus(code) { this.statusCode = code; return this; };
    response.json = function sendJson(payload) { this.body = payload; resolveDone(); return this; };
    response.fail = rejectDone;
    return response;
};

const invokeList = async (t, { rows = [] } = {}) => {
    const captured = {};
    t.mock.method(Student, 'findOne', () => chain(student));
    t.mock.method(Assignment, 'find', (filter) => {
        captured.filter = filter;
        return chain(rows);
    });
    t.mock.method(GrammarTest, 'find', () => chain([]));
    t.mock.method(GoogleFormSubmission, 'find', () => chain([]));

    const response = makeResponse();
    getMyAssignmentsForStudent(
        {
            schoolId: 'school-1',
            academicYear: '2026/2027',
            user: { role: 'student', _id: 'user-1' }
        },
        response,
        response.fail
    );
    await response.done;
    return { response, captured };
};

test('the student list query only admits published and closed work', async (t) => {
    const { captured } = await invokeList(t);

    assert.deepEqual(captured.filter.status, { $in: ['published', 'closed'] });
});

test('list items never carry targeting or excusal lists', async (t) => {
    const { response } = await invokeList(t, {
        rows: [{
            _id: 'assignment-1',
            title: 'Quiz',
            status: 'published',
            scope: 'selected_students',
            studentIds: ['student-1', 'student-2'],
            excusedStudentIds: ['student-1'],
            assignmentTypeKey: 'quiz'
        }]
    });

    const item = response.body.data.items[0];
    assert.equal(response.statusCode, 200);
    assert.equal('studentIds' in item, false);
    assert.equal('excusedStudentIds' in item, false);
    assert.equal('scope' in item, false);
    assert.equal(item.isExcused, true);
});

const attachmentAssignment = {
    _id: 'assignment-1',
    school: 'school-1',
    academicYear: '2026/2027',
    class: 'class-1',
    status: 'published',
    scope: 'class',
    studentIds: [],
    attachments: [{ _id: 'att-1', fileName: 'sheet.pdf', storageKey: 'keys/sheet.pdf' }]
};

const invokeAttachment = async (t, { row = attachmentAssignment, studentRow = student, role = 'student' } = {}) => {
    t.mock.method(Assignment, 'findOne', () => chain(row));
    t.mock.method(Student, 'findOne', () => chain(studentRow));

    const response = makeResponse();
    getAssignmentAttachmentUrl(
        {
            params: { id: 'assignment-1', attachmentId: 'att-1' },
            schoolId: 'school-1',
            user: { role, _id: 'user-1' }
        },
        response,
        response.fail
    );
    await response.done;
    return response;
};

test('a student cannot fetch attachment links for a draft', async (t) => {
    const response = await invokeAttachment(t, {
        row: { ...attachmentAssignment, status: 'draft' }
    });

    assert.equal(response.statusCode, 404);
});

test('a student outside the audience cannot fetch attachment links', async (t) => {
    const response = await invokeAttachment(t, {
        studentRow: { ...student, currentClass: 'class-9' }
    });

    assert.equal(response.statusCode, 403);
});

test('a student outside the academic year cannot fetch attachment links', async (t) => {
    const response = await invokeAttachment(t, { studentRow: null });

    assert.equal(response.statusCode, 403);
});