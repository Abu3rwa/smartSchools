import assert from 'node:assert/strict';
import test from 'node:test';

import {
    processCommunicationEmailSend,
    resolveOwnedAttachments
} from '../services/communicationEmailDispatchService.js';

const ATTACHMENT_ID = '507f1f77bcf86cd799439011';

const buildReq = () => ({
    schoolId: 'school-1',
    user: {
        _id: 'user-1',
        role: 'teacher',
        permissions: ['send_communication_emails'],
        gmailTokens: {
            isActive: true,
            email: 'teacher@school.com'
        },
        email: 'teacher@school.com',
        firstName: 'Teacher',
        lastName: 'One'
    }
});

const buildPreview = (overrides = {}) => ({
    selectedTokens: {
        parents: [],
        teachers: [],
        students: []
    },
    blockedTokens: [],
    recipientSummary: {
        students: 0,
        parents: 1,
        teachers: 0,
        duplicatesRemoved: 0,
        invalidExcluded: 0,
        totalResolved: 1
    },
    recipients: [{
        email: 'parent@school.com',
        category: 'parents',
        displayName: 'Parent'
    }],
    accessSnapshot: {},
    ...overrides
});

test('resolveOwnedAttachments enforces tenant + uploader scope on query', async () => {
    let receivedFilter = null;
    const attachmentModel = {
        find: async (filter) => {
            receivedFilter = filter;
            return [{ _id: ATTACHMENT_ID }];
        }
    };

    await resolveOwnedAttachments({
        attachmentIds: [ATTACHMENT_ID],
        schoolId: 'school-77',
        userId: 'user-88',
        attachmentModel
    });

    assert.equal(receivedFilter.school, 'school-77');
    assert.equal(receivedFilter.uploadedBy, 'user-88');
    assert.deepEqual(receivedFilter._id.$in, [ATTACHMENT_ID]);
});

test('processCommunicationEmailSend logs blocked tokens and returns 403', async () => {
    let loggedPayload = null;

    const result = await processCommunicationEmailSend({
        req: buildReq(),
        body: {
            subject: 'Important update',
            bodyHtml: '<p>hello</p>',
            toParents: [{ key: 'grp:parents:school', label: 'All parents' }]
        },
        deps: {
            scheduleParser: () => null,
            senderResolver: async () => ({
                senderEmail: 'teacher@school.com',
                senderDisplayName: 'Teacher One'
            }),
            recipientPreviewer: async () => buildPreview({
                blockedTokens: [{ key: 'grp:parents:school', reason: 'outside scope' }]
            }),
            logModel: {
                create: async (payload) => {
                    loggedPayload = payload;
                    return { _id: 'log-1' };
                }
            },
            attachmentModel: {
                find: async () => [],
                updateMany: async () => ({})
            }
        }
    });

    assert.equal(result.statusCode, 403);
    assert.equal(result.body.success, false);
    assert.equal(loggedPayload.status, 'blocked');
    assert.equal(loggedPayload.recipientSummary.totalResolved, 0);
    assert.deepEqual(loggedPayload.blockedTokenKeys, ['grp:parents:school']);
});

test('processCommunicationEmailSend creates schedule + log and marks attachments used', async () => {
    let schedulePayload = null;
    let logPayload = null;
    let updateManyPayload = null;

    const result = await processCommunicationEmailSend({
        req: buildReq(),
        body: {
            subject: 'Scheduled update',
            bodyHtml: '<p>scheduled</p>',
            attachmentIds: [ATTACHMENT_ID],
            scheduledForLocal: '2030-05-01T09:30',
            clientTimeZone: 'UTC'
        },
        deps: {
            scheduleParser: () => ({
                scheduledFor: new Date('2030-05-01T09:30:00.000Z'),
                scheduledForLocal: '2030-05-01T09:30',
                clientTimeZone: 'UTC'
            }),
            senderResolver: async () => ({
                senderEmail: 'teacher@school.com',
                senderDisplayName: 'Teacher One'
            }),
            recipientPreviewer: async () => buildPreview(),
            attachmentModel: {
                find: async () => [{
                    _id: ATTACHMENT_ID,
                    originalName: 'plan.pdf',
                    mimeType: 'application/pdf',
                    size: 128,
                    storagePath: 'schools/school-1/communication-email/user-1/plan.pdf'
                }],
                updateMany: async (filter, update) => {
                    updateManyPayload = { filter, update };
                    return {};
                }
            },
            logModel: {
                create: async (payload) => {
                    logPayload = payload;
                    return { _id: 'log-1' };
                },
                deleteOne: async () => ({})
            },
            scheduleModel: {
                create: async (payload) => {
                    schedulePayload = payload;
                    return { _id: 'schedule-1' };
                }
            }
        }
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.status, 'scheduled');
    assert.equal(logPayload.status, 'scheduled');
    assert.equal(schedulePayload.log, 'log-1');
    assert.equal(schedulePayload.scheduledForLocal, '2030-05-01T09:30');
    assert.equal(updateManyPayload.filter._id.$in[0], ATTACHMENT_ID);
});

test('processCommunicationEmailSend sends immediately and logs delivery totals', async () => {
    let loggedPayload = null;
    let sentPayload = null;

    const result = await processCommunicationEmailSend({
        req: buildReq(),
        body: {
            subject: 'Immediate update',
            bodyHtml: '<p>send now</p>'
        },
        deps: {
            scheduleParser: () => null,
            senderResolver: async () => ({
                senderEmail: 'teacher@school.com',
                senderDisplayName: 'Teacher One'
            }),
            recipientPreviewer: async () => buildPreview(),
            composedEmailSender: async (payload) => {
                sentPayload = payload;
                return {
                    status: 'partial',
                    totalSent: 1,
                    totalFailed: 1,
                    batchResults: [{ success: true, count: 1 }],
                    subject: payload.subject,
                    htmlBody: payload.htmlBody
                };
            },
            logModel: {
                create: async (payload) => {
                    loggedPayload = payload;
                    return { _id: 'log-2' };
                }
            },
            attachmentModel: {
                find: async () => [],
                updateMany: async () => ({})
            }
        }
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.status, 'partial');
    assert.equal(sentPayload.subject, 'Immediate update');
    assert.equal(loggedPayload.status, 'partial');
    assert.equal(loggedPayload.recipientSummary.totalSent, 1);
    assert.equal(loggedPayload.recipientSummary.totalFailed, 1);
});

test('processCommunicationEmailSend rejects when no recipients are resolved', async () => {
    await assert.rejects(
        () => processCommunicationEmailSend({
            req: buildReq(),
            body: {
                subject: 'No recipients',
                bodyHtml: '<p>empty</p>'
            },
            deps: {
                scheduleParser: () => null,
                senderResolver: async () => ({
                    senderEmail: 'teacher@school.com',
                    senderDisplayName: 'Teacher One'
                }),
                recipientPreviewer: async () => buildPreview({
                    recipients: [],
                    recipientSummary: {
                        students: 0,
                        parents: 0,
                        teachers: 0,
                        duplicatesRemoved: 0,
                        invalidExcluded: 0,
                        totalResolved: 0
                    }
                }),
                attachmentModel: {
                    find: async () => []
                }
            }
        }),
        /No valid recipients resolved/
    );
});
