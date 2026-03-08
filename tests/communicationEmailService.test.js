import assert from 'node:assert/strict';
import test from 'node:test';

import gmailOAuthService from '../services/gmailOAuthService.js';
import {
    generateCommunicationEmailDraft,
    hasValidEmailConnection,
    parseScheduledDeliveryInput,
    readSuggestionParams,
    resolveSenderIdentity,
    resolveAiDraftCapability,
    sendComposedEmail
} from '../services/communicationEmailService.js';

test('readSuggestionParams normalizes page and limit', () => {
    const req = {
        query: {
            field: 'students',
            query: 'grade 5',
            page: '3',
            limit: '250'
        }
    };

    const parsed = readSuggestionParams(req);
    assert.equal(parsed.field, 'students');
    assert.equal(parsed.query, 'grade 5');
    assert.equal(parsed.page, 3);
    assert.equal(parsed.limit, 100);
});

test('hasValidEmailConnection checks connected Gmail state', () => {
    assert.equal(hasValidEmailConnection(null), false);
    assert.equal(hasValidEmailConnection({ gmailTokens: { isActive: true, email: '' } }), false);
    assert.equal(hasValidEmailConnection({ gmailTokens: { isActive: false, email: 'user@school.com' } }), false);
    assert.equal(hasValidEmailConnection({ gmailTokens: { isActive: true, email: 'user@school.com' } }), true);
});

test('parseScheduledDeliveryInput converts local datetime using client timezone', () => {
    const parsed = parseScheduledDeliveryInput({
        scheduledForLocal: '2030-05-01T09:30',
        clientTimeZone: 'UTC',
        now: new Date('2030-05-01T08:00:00.000Z')
    });

    assert.equal(parsed.clientTimeZone, 'UTC');
    assert.equal(parsed.scheduledFor.toISOString(), '2030-05-01T09:30:00.000Z');
});

test('parseScheduledDeliveryInput rejects invalid timezone', () => {
    assert.throws(
        () => parseScheduledDeliveryInput({
            scheduledForLocal: '2030-05-01T09:30',
            clientTimeZone: 'Invalid/Zone',
            now: new Date('2030-05-01T08:00:00.000Z')
        }),
        /valid client time zone/i
    );
});

test('resolveSenderIdentity prefers loaded sender profile', async () => {
    const sender = await resolveSenderIdentity({
        senderUserId: '507f1f77bcf86cd799439011',
        fallbackUser: {
            firstName: 'Fallback',
            lastName: 'User',
            email: 'fallback@school.com'
        },
        userLoader: async () => ({
            firstName: 'Current',
            lastName: 'Staff',
            email: 'staff@school.com',
            gmailTokens: { email: 'gmail.staff@school.com' }
        })
    });

    assert.equal(sender.senderDisplayName, 'Current Staff');
    assert.equal(sender.senderEmail, 'gmail.staff@school.com');
});

test('sendComposedEmail deduplicates recipients and reports partial failures', async () => {
    const originalSendEmail = gmailOAuthService.sendEmail;
    let callCount = 0;
    let latestPayload = null;

    gmailOAuthService.sendEmail = async (_userId, payload) => {
        callCount += 1;
        latestPayload = payload;
        const toValue = String(payload.to || '');
        if (toValue.includes(',')) {
            throw new Error('Batch rejected');
        }
        if (toValue.includes('parent@school.com')) {
            return { messageId: `m-${callCount}`, threadId: `t-${callCount}` };
        }
        throw new Error('Single recipient failed');
    };

    try {
        const result = await sendComposedEmail({
            senderUserId: 'user-1',
            senderDisplayName: 'Sender',
            senderEmail: 'sender@school.com',
            subject: 'Update',
            htmlBody: '<p>Hello families</p>',
            recipients: [
                { email: 'parent@school.com' },
                { email: 'PARENT@school.com' },
                { email: 'teacher@school.com' },
                { email: 'not-an-email' }
            ],
            attachments: [
                {
                    originalName: 'ClassPlan.pdf',
                    storagePath: 'schools/1/communication-email/file.pdf',
                    size: 2048
                }
            ],
            attachmentLoader: async (fileRefOrPath) => ({
                buffer: Buffer.from(`mock-file:${String(fileRefOrPath)}`, 'utf8'),
                contentType: 'application/pdf'
            })
        });

        assert.equal(result.status, 'partial');
        assert.equal(result.totalSent, 1);
        assert.equal(result.totalFailed, 1);
        assert.equal(callCount, 3);
        assert.equal(Array.isArray(latestPayload.attachments), true);
        assert.equal(latestPayload.attachments.length, 1);
        assert.equal(latestPayload.attachments[0].filename, 'ClassPlan.pdf');
        assert.equal(Buffer.isBuffer(latestPayload.attachments[0].content), true);
        assert.equal(String(result.htmlBody || '').includes('Attachments'), false);
    } finally {
        gmailOAuthService.sendEmail = originalSendEmail;
    }
});

test('resolveAiDraftCapability supports plan and school-admin gates', async () => {
    const locked = await resolveAiDraftCapability({
        schoolId: 'school-1',
        featureContextResolver: async () => ({ features: { aiEmailDrafts: false } }),
        schoolLoader: async () => ({ settings: { communication: { aiEmailDraftEnabled: true } } })
    });
    assert.equal(locked.canUse, false);
    assert.equal(locked.reason, 'plan_locked');

    const disabled = await resolveAiDraftCapability({
        schoolId: 'school-2',
        featureContextResolver: async () => ({ features: { aiEmailDrafts: true } }),
        schoolLoader: async () => ({ settings: { communication: { aiEmailDraftEnabled: false } } })
    });
    assert.equal(disabled.canUse, false);
    assert.equal(disabled.reason, 'disabled_by_school_admin');

    const enabled = await resolveAiDraftCapability({
        schoolId: 'school-3',
        featureContextResolver: async () => ({ features: { aiEmailDrafts: true } }),
        schoolLoader: async () => ({ settings: { communication: { aiEmailDraftEnabled: true } } })
    });
    assert.equal(enabled.canUse, true);
    assert.equal(enabled.reason, 'enabled');
});

test('generateCommunicationEmailDraft sanitizes output and logs token usage', async () => {
    let tokenUsagePayload = null;
    const draft = await generateCommunicationEmailDraft({
        schoolId: '507f191e810c19729de860ea',
        userId: '507f1f77bcf86cd799439011',
        prompt: 'Draft a short update for parents about tomorrow schedule.',
        tone: 'concise',
        selection: {
            toParents: [{ key: 'grp:parents:school', label: 'All parents in school' }]
        },
        aiConnector: async () => ({
            text: '<script>alert(1)</script><p>Hello parents</p>',
            inputtokenCount: 25,
            outputtokenCount: 40,
            totalTokenCount: 65,
            modelName: 'gemini-test'
        }),
        tokenUsageModel: {
            create: async (payload) => {
                tokenUsagePayload = payload;
                return { _id: '507f1f77bcf86cd799439012' };
            }
        }
    });

    assert.equal(String(draft.bodyHtml).includes('<script>'), false);
    assert.equal(String(draft.bodyHtml).includes('<p>Hello parents</p>'), true);
    assert.equal(draft.usage.logged, true);
    assert.equal(draft.usage.totalTokens, 65);
    assert.equal(tokenUsagePayload.feature, 'communication_email_draft');
});
