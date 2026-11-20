import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import Assignment from '../models/Assignment.js';
import Class from '../models/Class.js';
import AssignmentType from '../models/AssignmentType.js';
import googleDriveFileService from '../services/googleDriveFileService.js';
import { draftAssignmentBrief } from '../controllers/assignmentController.js';

const makeResponse = () => {
    const response = { statusCode: 200, body: null };
    let resolveResponse;
    let rejectResponse;
    const responseDone = new Promise((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
    });
    response.status = function setStatus(code) {
        this.statusCode = code;
        return this;
    };
    response.json = function sendJson(body) {
        this.body = body;
        resolveResponse();
        return this;
    };
    return { response, responseDone, rejectResponse };
};

const invoke = async (handler, req) => {
    const { response, responseDone, rejectResponse } = makeResponse();
    let nextError = null;
    await handler(req, response, (error) => {
        nextError = error;
        rejectResponse(error);
    });
    await responseDone.catch(() => {});
    return { response, nextError };
};

const mockClassAndType = (t) => {
    t.mock.method(Class, 'findOne', () => ({
        select: () => ({
            lean: async () => ({ _id: 'class-1', subjects: [{ subject: 'subject-1' }] })
        })
    }));
    t.mock.method(AssignmentType, 'findOne', async () => ({
        _id: 'type-homework',
        key: 'homework',
        name: 'Homework'
    }));
};

const draftReq = (body = {}) => ({
    schoolId: 'school-1',
    user: { role: 'admin', _id: 'admin-1' },
    body: {
        classId: 'class-1',
        subjectId: 'subject-1',
        assignmentTypeId: 'type-homework',
        ...body
    }
});

const mockAssignmentLookup = (t, assignment) => {
    t.mock.method(Assignment, 'findOne', () => ({
        lean: async () => assignment
    }));
};

const savedAssignment = (overrides = {}) => ({
    _id: 'assignment-1',
    school: 'school-1',
    teacher: 'admin-1',
    class: 'class-1',
    subject: 'subject-1',
    driveAttachments: [
        {
            fileId: 'drive-9',
            fileName: 'Lesson.pdf',
            mimeType: 'application/pdf',
            visibility: 'private'
        }
    ],
    ...overrides
});

test('a saved assignment id is required before reading a Drive source', async (t) => {
    mockClassAndType(t);

    const { nextError } = await invoke(draftAssignmentBrief, draftReq({
        sourceFileId: 'drive-9'
    }));

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.code, 'DRAFT_SOURCE_REQUIRED');
});

test('a source file that is not on the assignment is refused', async (t) => {
    mockClassAndType(t);
    mockAssignmentLookup(t, savedAssignment());

    const { nextError } = await invoke(draftAssignmentBrief, draftReq({
        assignmentId: 'assignment-1',
        sourceFileId: 'drive-other'
    }));

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.code, 'DRAFT_SOURCE_REQUIRED');
});

test('a source AI cannot read is refused before any download', async (t) => {
    mockClassAndType(t);
    mockAssignmentLookup(t, savedAssignment({
        driveAttachments: [{
            fileId: 'drive-9',
            fileName: 'Plan.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }]
    }));
    let downloads = 0;
    t.mock.method(googleDriveFileService, 'downloadFile', async () => {
        downloads += 1;
        return Buffer.from('x');
    });

    const { nextError } = await invoke(draftAssignmentBrief, draftReq({
        assignmentId: 'assignment-1',
        sourceFileId: 'drive-9'
    }));

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.code, 'DOCUMENT_TYPE_UNSUPPORTED');
    assert.equal(downloads, 0);
});

test('a Drive file that disappeared is a clear 404, not a generic failure', async (t) => {
    mockClassAndType(t);
    mockAssignmentLookup(t, savedAssignment());
    t.mock.method(googleDriveFileService, 'downloadFile', async () => {
        const error = new Error('gone');
        error.code = 'DRIVE_FILE_NOT_FOUND';
        error.statusCode = 404;
        throw error;
    });

    const { nextError } = await invoke(draftAssignmentBrief, draftReq({
        assignmentId: 'assignment-1',
        sourceFileId: 'drive-9'
    }));

    assert.equal(nextError.statusCode, 404);
    assert.equal(nextError.code, 'DRIVE_FILE_NOT_FOUND');
});

test('a dead Drive connection names the reconnect step', async (t) => {
    mockClassAndType(t);
    mockAssignmentLookup(t, savedAssignment());
    t.mock.method(googleDriveFileService, 'downloadFile', async () => {
        const error = new Error('connect');
        error.code = 'DRIVE_FILE_NOT_CONNECTED';
        throw error;
    });

    const { nextError } = await invoke(draftAssignmentBrief, draftReq({
        assignmentId: 'assignment-1',
        sourceFileId: 'drive-9'
    }));

    assert.equal(nextError.statusCode, 403);
    assert.equal(nextError.code, 'DRIVE_FILE_NOT_CONNECTED');
});

test('an assignment from another school is never read', async (t) => {
    mockClassAndType(t);
    mockAssignmentLookup(t, null);

    const { nextError } = await invoke(draftAssignmentBrief, draftReq({
        assignmentId: 'assignment-1',
        sourceFileId: 'drive-9'
    }));

    assert.equal(nextError.statusCode, 404);
    assert.equal(nextError.code, 'DRAFT_ASSIGNMENT_NOT_FOUND');
});
