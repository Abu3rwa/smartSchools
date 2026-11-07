import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import Assignment from '../models/Assignment.js';
import AssignmentClassroomLink from '../models/AssignmentClassroomLink.js';
import Grade from '../models/Grade.js';
import GoogleFormSubmission from '../models/GoogleFormSubmission.js';
import Teacher from '../models/Teacher.js';
import User from '../models/User.js';
import notificationService from '../services/notificationService.js';
import googleDriveFileService from '../services/googleDriveFileService.js';
import { GOOGLE_DRIVE_FILE_SCOPE, hasDriveFileScope } from '../config/googleDriveFileScopes.js';
import {
    deleteAssignment,
    deleteDriveAttachment,
    uploadDriveAttachments
} from '../controllers/assignmentController.js';

const FILE_DOC = {
    fileId: 'drive-1',
    fileName: 'Worksheet.pdf',
    mimeType: 'application/pdf',
    size: 1234,
    webViewLink: 'https://drive.google.com/file/d/drive-1/view',
    iconLink: 'https://drive.google.com/icon.png'
};

const makeResponse = () => {
    const response = { statusCode: 200, body: null };
    let resolveDone;
    response.done = new Promise((resolve) => { resolveDone = resolve; });
    response.status = function setStatus(code) { this.statusCode = code; return this; };
    response.json = function sendJson(payload) { this.body = payload; resolveDone(); return this; };
    return response;
};

const invoke = async (handler, req) => {
    const response = makeResponse();
    let nextError = null;
    let rejectDone;
    const failed = new Promise((_, reject) => { rejectDone = reject; });
    // asyncHandler does not return its promise, so wait for json() or next(err).
    await handler(req, response, (error) => { nextError = error; rejectDone(error); });
    await Promise.race([response.done, failed]).catch(() => {});
    return { response, nextError };
};

const assignmentDoc = (overrides = {}) => ({
    _id: 'assignment-1',
    school: 'school-1',
    teacher: 'teacher-1',
    class: 'class-1',
    subject: 'subject-1',
    attachments: [],
    driveAttachments: [],
    saveCount: 0,
    async save() { this.saveCount += 1; },
    async deleteOne() { this.deleted = true; },
    ...overrides
});

const uploadReq = (files, doc, user = { role: 'admin', _id: 'admin-1' }) => ({
    params: { id: 'assignment-1' },
    schoolId: 'school-1',
    user,
    files,
    doc
});

const mockUploadService = (t, { connected = true, results = [FILE_DOC], failOnCall = null } = {}) => {
    const calls = { isConnected: 0, uploads: [], trashed: [] };
    t.mock.method(googleDriveFileService, 'isConnected', async () => {
        calls.isConnected += 1;
        return connected;
    });
    t.mock.method(googleDriveFileService, 'uploadAttachmentFile', async (userId, file) => {
        calls.uploads.push({ userId, file });
        if (failOnCall && calls.uploads.length === failOnCall) {
            const error = new Error('Drive said no');
            error.statusCode = 502;
            throw error;
        }
        return results[calls.uploads.length - 1] || FILE_DOC;
    });
    t.mock.method(googleDriveFileService, 'trashFilesBestEffort', async (userId, fileIds) => {
        calls.trashed.push({ userId, fileIds });
    });
    return calls;
};

/* ---------------------------------------------------------------- */
/* Upload endpoint                                                   */
/* ---------------------------------------------------------------- */

test('uploading Drive attachments stores the returned metadata on the assignment', async (t) => {
    const doc = assignmentDoc();
    t.mock.method(Assignment, 'findOne', async () => doc);
    const calls = mockUploadService(t);
    const file = { originalname: 'Worksheet.pdf', mimetype: 'application/pdf', buffer: Buffer.from('x'), size: 1 };

    const { response, nextError } = await invoke(uploadDriveAttachments, uploadReq([file], doc));

    assert.equal(nextError, null);
    assert.equal(response.statusCode, 200);
    assert.equal(calls.uploads.length, 1);
    assert.equal(calls.uploads[0].userId, 'admin-1');
    assert.equal(doc.saveCount, 1);
    assert.deepEqual(doc.driveAttachments, [FILE_DOC]);
    assert.deepEqual(response.body.data.driveAttachments, [FILE_DOC]);
});

test('uploading without files is a 400 before any Drive call', async (t) => {
    const doc = assignmentDoc();
    t.mock.method(Assignment, 'findOne', async () => doc);
    const calls = mockUploadService(t);

    const { response } = await invoke(uploadDriveAttachments, uploadReq([], doc));

    assert.equal(response.statusCode, 400);
    assert.equal(calls.isConnected, 0);
    assert.equal(calls.uploads.length, 0);
});

test('uploading without a Drive connection is a 403 with a reconnect code', async (t) => {
    const doc = assignmentDoc();
    t.mock.method(Assignment, 'findOne', async () => doc);
    const calls = mockUploadService(t, { connected: false });

    const { response } = await invoke(uploadDriveAttachments, uploadReq([{ originalname: 'a.pdf' }], doc));

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 'DRIVE_FILE_NOT_CONNECTED');
    assert.equal(calls.uploads.length, 0);
    assert.equal(doc.saveCount, 0);
});

test('a missing assignment is a 404', async (t) => {
    t.mock.method(Assignment, 'findOne', async () => null);
    const calls = mockUploadService(t);

    const { response } = await invoke(uploadDriveAttachments, uploadReq([{ originalname: 'a.pdf' }], null));

    assert.equal(response.statusCode, 404);
    assert.equal(calls.uploads.length, 0);
});

test('a teacher who does not own the assignment cannot upload to it', async (t) => {
    const doc = assignmentDoc({ teacher: 'someone-else' });
    t.mock.method(Assignment, 'findOne', async () => doc);
    t.mock.method(Teacher, 'findOne', async () => null);
    const calls = mockUploadService(t);

    const { response } = await invoke(
        uploadDriveAttachments,
        uploadReq([{ originalname: 'a.pdf' }], doc, { role: 'teacher', _id: 'user-2' })
    );

    assert.equal(response.statusCode, 403);
    assert.equal(calls.uploads.length, 0);
});

test('a half-finished batch trashes the files already uploaded', async (t) => {
    const doc = assignmentDoc();
    t.mock.method(Assignment, 'findOne', async () => doc);
    const calls = mockUploadService(t, { failOnCall: 2 });

    const { nextError } = await invoke(
        uploadDriveAttachments,
        uploadReq([{ originalname: 'a.pdf' }, { originalname: 'b.pdf' }], doc)
    );

    assert.ok(nextError);
    assert.equal(nextError.statusCode, 502);
    assert.deepEqual(calls.trashed, [{ userId: 'admin-1', fileIds: ['drive-1'] }]);
    assert.equal(doc.saveCount, 0);
    assert.deepEqual(doc.driveAttachments, []);
});

/* ---------------------------------------------------------------- */
/* Delete endpoint                                                   */
/* ---------------------------------------------------------------- */

const mockTrash = (t, { connected = true } = {}) => {
    const calls = { trashed: [] };
    t.mock.method(googleDriveFileService, 'isConnected', async () => connected);
    t.mock.method(googleDriveFileService, 'trashFile', async (userId, fileId) => {
        calls.trashed.push({ userId, fileId });
    });
    return calls;
};

test('removing a Drive attachment trashes it and drops the row', async (t) => {
    const doc = assignmentDoc({ driveAttachments: [{ ...FILE_DOC }] });
    t.mock.method(Assignment, 'findOne', async () => doc);
    const calls = mockTrash(t);

    const { response, nextError } = await invoke(deleteDriveAttachment, {
        params: { id: 'assignment-1', fileId: 'drive-1' },
        schoolId: 'school-1',
        user: { role: 'admin', _id: 'admin-1' }
    });

    assert.equal(nextError, null);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls.trashed, [{ userId: 'admin-1', fileId: 'drive-1' }]);
    assert.deepEqual(doc.driveAttachments, []);
    assert.equal(doc.saveCount, 1);
});

test('removing an unknown fileId is a 404 and never touches Drive', async (t) => {
    const doc = assignmentDoc({ driveAttachments: [{ ...FILE_DOC }] });
    t.mock.method(Assignment, 'findOne', async () => doc);
    const calls = mockTrash(t);

    const { response } = await invoke(deleteDriveAttachment, {
        params: { id: 'assignment-1', fileId: 'nope' },
        schoolId: 'school-1',
        user: { role: 'admin', _id: 'admin-1' }
    });

    assert.equal(response.statusCode, 404);
    assert.equal(calls.trashed.length, 0);
    assert.equal(doc.saveCount, 0);
});

test('a disconnected teacher can still drop the row; the Drive file stays in their Drive', async (t) => {
    const doc = assignmentDoc({ driveAttachments: [{ ...FILE_DOC }] });
    t.mock.method(Assignment, 'findOne', async () => doc);
    const calls = mockTrash(t, { connected: false });

    const { response } = await invoke(deleteDriveAttachment, {
        params: { id: 'assignment-1', fileId: 'drive-1' },
        schoolId: 'school-1',
        user: { role: 'admin', _id: 'admin-1' }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(calls.trashed.length, 0);
    assert.deepEqual(doc.driveAttachments, []);
});

test('deleting the assignment trashes its Drive files best-effort', async (t) => {
    const doc = assignmentDoc({ driveAttachments: [{ ...FILE_DOC }] });
    t.mock.method(Assignment, 'findOne', async () => doc);
    t.mock.method(Grade, 'deleteMany', async () => ({ deletedCount: 0 }));
    t.mock.method(GoogleFormSubmission, 'deleteMany', async () => ({ deletedCount: 0 }));
    t.mock.method(AssignmentClassroomLink, 'deleteMany', async () => ({ deletedCount: 0 }));
    const calls = { trashed: [] };
    t.mock.method(googleDriveFileService, 'trashFilesBestEffort', async (userId, fileIds) => {
        calls.trashed.push({ userId, fileIds });
    });

    const { response } = await invoke(deleteAssignment, {
        params: { id: 'assignment-1' },
        schoolId: 'school-1',
        user: { role: 'admin', _id: 'admin-1' }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls.trashed, [{ userId: 'admin-1', fileIds: ['drive-1'] }]);
    assert.equal(doc.deleted, true);
});

/* ---------------------------------------------------------------- */
/* Service: upload + share + trash                                   */
/* ---------------------------------------------------------------- */

const mockDriveClient = (t, { createError = null, shareError = null, trashError = null } = {}) => {
    const calls = { created: [], shared: [], trashed: [] };
    const drive = {
        files: {
            create: async (params) => {
                calls.created.push(params);
                if (createError) throw createError;
                return {
                    data: {
                        id: 'drive-9',
                        name: params.requestBody.name,
                        mimeType: params.media.mimeType,
                        size: '42',
                        webViewLink: 'https://drive.google.com/file/d/drive-9/view',
                        iconLink: 'https://drive.google.com/icon9.png'
                    }
                };
            },
            update: async (params) => {
                calls.trashed.push(params);
                if (trashError) throw trashError;
                return { data: {} };
            }
        },
        permissions: {
            create: async (params) => {
                calls.shared.push(params);
                if (shareError) throw shareError;
                return { data: {} };
            }
        }
    };
    t.mock.method(googleDriveFileService, 'buildDriveClient', async () => ({ user: {}, drive }));
    return calls;
};

test('the service uploads the bytes then shares the file with anyone as reader', async (t) => {
    const calls = mockDriveClient(t);
    const file = { originalname: 'Worksheet.pdf', mimetype: 'application/pdf', buffer: Buffer.from('bytes'), size: 5 };

    const result = await googleDriveFileService.uploadAttachmentFile('user-1', file);

    assert.equal(calls.created.length, 1);
    assert.equal(calls.created[0].requestBody.name, 'Worksheet.pdf');
    assert.equal(calls.created[0].media.mimeType, 'application/pdf');
    assert.deepEqual(calls.shared, [{ fileId: 'drive-9', requestBody: { role: 'reader', type: 'anyone' } }]);
    assert.deepEqual(result, {
        fileId: 'drive-9',
        fileName: 'Worksheet.pdf',
        mimeType: 'application/pdf',
        size: 42,
        webViewLink: 'https://drive.google.com/file/d/drive-9/view',
        iconLink: 'https://drive.google.com/icon9.png'
    });
});

test('a failed share trashes the orphan upload instead of leaving it unlisted', async (t) => {
    const calls = mockDriveClient(t, { shareError: new Error('nope') });
    const file = { originalname: 'a.pdf', mimetype: 'application/pdf', buffer: Buffer.from('x') };

    await assert.rejects(
        () => googleDriveFileService.uploadAttachmentFile('user-1', file),
        (error) => error.code === 'DRIVE_FILE_API_FAILED' && error.statusCode === 502
    );
    assert.deepEqual(calls.trashed.map((call) => call.fileId), ['drive-9']);
});

test('a failed upload never reaches the sharing step', async (t) => {
    const calls = mockDriveClient(t, { createError: new Error('quota') });

    await assert.rejects(
        () => googleDriveFileService.uploadAttachmentFile('user-1', { originalname: 'a.pdf', buffer: Buffer.from('x') }),
        (error) => error.code === 'DRIVE_FILE_API_FAILED'
    );
    assert.equal(calls.shared.length, 0);
});

test('trashing tolerates a file already gone from Drive', async (t) => {
    const notFound = new Error('gone');
    notFound.code = 404;
    const calls = mockDriveClient(t, { trashError: notFound });

    await googleDriveFileService.trashFile('user-1', 'drive-9');

    assert.equal(calls.trashed.length, 1);
    assert.deepEqual(calls.trashed[0].requestBody, { trashed: true });
});

test('best-effort cleanup does nothing without a connection', async (t) => {
    t.mock.method(googleDriveFileService, 'isConnected', async () => false);
    const calls = mockDriveClient(t);

    await googleDriveFileService.trashFilesBestEffort('user-1', ['drive-9']);

    assert.equal(calls.trashed.length, 0);
});

/* ---------------------------------------------------------------- */
/* Token storage + scope checks                                      */
/* ---------------------------------------------------------------- */

test('drive.file tokens record granted scopes and keep the old refresh token', async () => {
    const fakeUser = {
        googleDriveFileTokens: { email: 't@school.test', refreshToken: 'old-refresh', grantedScopes: [] },
        async save() { return this; }
    };
    await User.schema.methods.updateGoogleDriveFileTokens.call(fakeUser, {
        access_token: 'a',
        expiry_date: Date.now() + 3600_000,
        scope: `${GOOGLE_DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/userinfo.email`
    }, null);

    assert.equal(fakeUser.googleDriveFileTokens.refreshToken, 'old-refresh');
    assert.equal(fakeUser.googleDriveFileTokens.email, 't@school.test');
    assert.ok(hasDriveFileScope(fakeUser.googleDriveFileTokens.grantedScopes));
    assert.equal(fakeUser.googleDriveFileTokens.isActive, true);
});

test('clearing drive.file tokens leaves the curriculum connection alone', async () => {
    const fakeUser = {
        googleDriveTokens: { isActive: true, refreshToken: 'curriculum' },
        googleDriveFileTokens: { isActive: true, refreshToken: 'files' },
        async save() { return this; }
    };
    await User.schema.methods.clearGoogleDriveFileTokens.call(fakeUser);

    assert.equal(fakeUser.googleDriveFileTokens.isActive, false);
    assert.deepEqual(fakeUser.googleDriveFileTokens.grantedScopes, []);
    assert.equal(fakeUser.googleDriveTokens.isActive, true);
    assert.equal(fakeUser.googleDriveTokens.refreshToken, 'curriculum');
});

test('the attachment scope set never includes readonly or full Drive', () => {
    assert.equal(hasDriveFileScope([GOOGLE_DRIVE_FILE_SCOPE]), true);
    assert.equal(hasDriveFileScope(['https://www.googleapis.com/auth/drive.readonly']), false);
    assert.equal(hasDriveFileScope(['https://www.googleapis.com/auth/drive']), false);
    assert.equal(hasDriveFileScope([]), false);
});

/* ---------------------------------------------------------------- */
/* Posted email content                                              */
/* ---------------------------------------------------------------- */

test('posted assignment emails list Drive attachments alongside links', async () => {
    const content = await notificationService._buildAssignmentPostedContent({
        student: { fullName: 'A Student' },
        assignment: {
            _id: 'assignment-1',
            title: 'Fractions',
            assignmentTypeName: 'Homework',
            links: [{ type: 'external_url', title: 'Guide', url: 'https://example.com/guide' }],
            driveAttachments: [
                { fileName: 'Worksheet.pdf', webViewLink: 'https://drive.google.com/file/d/d1/view' },
                { fileName: 'No link' }
            ],
            attachments: []
        },
        audience: 'parent'
    });

    assert.match(content.htmlContent, /https:\/\/drive\.google\.com\/file\/d\/d1\/view/);
    assert.match(content.htmlContent, /Worksheet\.pdf/);
    assert.match(content.htmlContent, /https:\/\/example\.com\/guide/);
    assert.doesNotMatch(content.htmlContent, /No link/);
});