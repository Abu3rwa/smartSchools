import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';
import gmailOAuthService from '../services/gmailOAuthService.js';
import notificationService from '../services/notificationService.js';
import { sendTransactionalEmail } from '../services/transactionalEmailService.js';

const reauthError = () => Object.assign(
    new Error('Google authorization is required'),
    { code: 'GMAIL_REAUTH_REQUIRED', statusCode: 401 }
);

test('an explicit sender that cannot send falls back to the school Gmail', async () => {
    const originalSendEmail = gmailOAuthService.sendEmail;
    const originalHasValidTokens = gmailOAuthService.hasValidTokens;
    const originalFind = User.find;
    const senderIds = [];
    gmailOAuthService.sendEmail = async (senderId) => {
        senderIds.push(senderId);
        if (senderId === 'teacher-id') throw reauthError();
        return { messageId: 'admin-message', threadId: 'admin-thread' };
    };
    gmailOAuthService.hasValidTokens = async () => true;
    User.find = () => ({
        select: () => ({
            setOptions: () => ({ lean: async () => [{ _id: 'admin-id' }] })
        })
    });

    try {
        const result = await sendTransactionalEmail({
            to: 'student@example.test',
            subject: 'Practice task',
            text: 'A practice task is ready.',
            schoolId: 'school-id',
            preferredUserId: 'teacher-id',
            allowAdminFallback: true,
            allowSmtp: true
        });
        assert.equal(result.channel, 'admin_gmail_fallback');
        assert.deepEqual(senderIds, ['teacher-id', 'admin-id']);
    } finally {
        gmailOAuthService.sendEmail = originalSendEmail;
        gmailOAuthService.hasValidTokens = originalHasValidTokens;
        User.find = originalFind;
    }
});

test('a caller that forbids alternates still reports the sender failure', async () => {
    const originalSendEmail = gmailOAuthService.sendEmail;
    const senderIds = [];
    gmailOAuthService.sendEmail = async (senderId) => {
        senderIds.push(senderId);
        throw reauthError();
    };

    try {
        await assert.rejects(
            sendTransactionalEmail({
                to: 'student@example.test',
                subject: 'Practice task',
                text: 'A practice task is ready.',
                schoolId: 'school-id',
                preferredUserId: 'teacher-id',
                allowAdminFallback: false,
                allowSmtp: false
            }),
            (error) => error.code === 'GMAIL_REAUTH_REQUIRED'
        );
        assert.deepEqual(senderIds, ['teacher-id']);
    } finally {
        gmailOAuthService.sendEmail = originalSendEmail;
    }
});

test('notification email failure for an explicit sender does not fall back to another account', async () => {
    const originalSendEmail = gmailOAuthService.sendEmail;
    const originalResolveSchoolName = notificationService._resolveSchoolName;
    const senderIds = [];
    gmailOAuthService.sendEmail = async (senderId) => {
        senderIds.push(senderId);
        const error = new Error('Google authorization is required');
        error.code = 'GMAIL_REAUTH_REQUIRED';
        error.statusCode = 401;
        throw error;
    };
    notificationService._resolveSchoolName = async () => '';
    const notification = {
        recipientEmail: 'student@example.test',
        subject: 'Practice task',
        message: 'A practice task is ready.',
        htmlContent: '',
        school: 'school-id',
        save: async () => {}
    };

    try {
        await assert.rejects(
            notificationService.sendEmail(notification, 'teacher-id'),
            (error) => error.code === 'GMAIL_REAUTH_REQUIRED'
        );
        assert.deepEqual(senderIds, ['teacher-id']);
        assert.equal(notification.status, 'failed');
    } finally {
        gmailOAuthService.sendEmail = originalSendEmail;
        notificationService._resolveSchoolName = originalResolveSchoolName;
    }
});

test('a missing Gmail connection stays flagged so the teacher can be prompted later', async () => {
    const originalFindById = User.findById;
    const user = {
        gmailTokens: {},
        hasGmailConnected: () => false,
        set: (path, value) => {
            if (path === 'gmailTokens.reauthorizationRequired') {
                user.gmailTokens.reauthorizationRequired = value;
            }
        },
        save: async () => {}
    };
    User.findById = async () => user;

    try {
        await assert.rejects(
            gmailOAuthService.sendEmail('teacher-id', { to: 'student@example.test' }),
            (error) => error.code === 'GMAIL_REAUTH_REQUIRED'
        );
        const status = await gmailOAuthService.getTokenStatus('teacher-id');
        assert.equal(status.requiresReauth, true);
    } finally {
        User.findById = originalFindById;
    }
});
