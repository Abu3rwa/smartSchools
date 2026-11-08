import test from 'node:test';
import assert from 'node:assert/strict';
import Assignment from '../models/Assignment.js';
import Student from '../models/Student.js';
import Grade from '../models/Grade.js';
import GoogleFormSubmission from '../models/GoogleFormSubmission.js';
import AssignmentClassroomLink from '../models/AssignmentClassroomLink.js';
import { getAssignmentDetail } from '../controllers/assignmentController.js';

const assignment = {
    _id: '6af075f7d1712618b41696bd',
    school: 'school-1',
    academicYear: '2026/2027',
    class: { _id: 'class-1', name: 'Grade 5 · A' },
    subject: { _id: 'subject-1', name: 'Science' },
    teacher: { _id: 'teacher-1', firstName: 'Rana', lastName: 'Ali' },
    assignmentType: { _id: 'type-1', key: 'google_form', name: 'Quiz' },
    assignmentTypeKey: 'google_form',
    assignmentTypeName: 'Quiz',
    title: 'Water cycle quiz',
    summary: 'Label the stages of the water cycle.',
    instructions: 'Read page 12 before you start.',
    status: 'published',
    scope: 'class',
    studentIds: [],
    excusedStudentIds: [],
    maxMarks: 10,
    links: [
        { _id: 'link-1', type: 'external_url', title: 'Study guide', url: 'https://example.com/guide' }
    ],
    attachments: [
        { _id: 'att-1', fileName: 'worksheet.pdf', storageKey: '', url: 'https://files.example.com/w.pdf' }
    ],
    driveAttachments: [
        { fileId: 'f1', fileName: 'Slides', webViewLink: 'https://drive.google.com/file/d/f1/view' }
    ],
    lessonPlanIds: [],
    metadata: {
        googleForm: {
            responderUri: 'https://docs.google.com/forms/d/e/abc/viewform',
            questions: []
        }
    },
    createdAt: '2026-11-01T08:00:00.000Z'
};

const student = {
    _id: 'student-1',
    firstName: 'Areen',
    lastName: 'Hassan',
    currentClass: { _id: 'class-1', name: 'Grade 5 · A' }
};

const chain = (value) => {
    const proxy = {
        populate: () => proxy,
        select: () => proxy,
        sort: () => proxy,
        lean: async () => value
    };
    return proxy;
};

const invoke = async ({ assignmentRow = assignment, studentRow = student } = {}, t) => {
    t.mock.method(Assignment, 'findOne', () => chain(assignmentRow));
    t.mock.method(Student, 'findOne', () => chain(studentRow));
    t.mock.method(GoogleFormSubmission, 'find', () => chain([
        { student: 'student-1', status: 'submitted', submittedAt: '2026-11-02T10:00:00.000Z' }
    ]));
    t.mock.method(Grade, 'find', () => chain([
        { student: 'student-1', marks: 8, maxMarks: 10, remarks: 'Good work', date: '2026-11-03T09:00:00.000Z' }
    ]));
    t.mock.method(AssignmentClassroomLink, 'findOne', () => chain({
        alternateLink: 'https://classroom.google.com/c/course-1/a/coursework-1',
        courseId: 'course-1'
    }));

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

    await getAssignmentDetail(
        {
            params: { id: assignment._id },
            schoolId: 'school-1',
            user: { role: 'student', _id: 'user-1' }
        },
        response,
        (error) => { rejectResponse(error); }
    );
    await responseDone;

    return response;
};

test('a student in the class gets the full detail card with every resource', async (t) => {
    const response = await invoke({}, t);
    const data = response.body.data;

    assert.equal(response.statusCode, 200);
    assert.equal(data.title, 'Water cycle quiz');
    assert.equal(data.teacher, 'Rana Ali');
    assert.equal(data.subject.name, 'Science');
    assert.deepEqual(data.attachments.map((att) => att.url), ['https://files.example.com/w.pdf']);
    assert.equal(data.driveAttachments[0].webViewLink, 'https://drive.google.com/file/d/f1/view');
    assert.equal(data.classroom.url, 'https://classroom.google.com/c/course-1/a/coursework-1');
    assert.equal(data.students[0].grade.marks, 8);
    assert.equal(data.students[0].submission.status, 'submitted');
    assert.equal(
        data.googleForm.responderUri,
        'https://docs.google.com/forms/d/e/abc/viewform'
    );
});

test('a student outside the assignment class cannot open the detail', async (t) => {
    const response = await invoke({
        studentRow: { ...student, currentClass: { _id: 'class-9', name: 'Grade 6 · B' } }
    }, t);

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.success, false);
});

test('a missing assignment returns a neutral not-found response', async (t) => {
    const response = await invoke({ assignmentRow: null }, t);

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
});
