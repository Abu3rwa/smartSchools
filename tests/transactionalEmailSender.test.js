import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';
import gmailOAuthService from '../services/gmailOAuthService.js';
import notificationService from '../services/notificationService.js';
import { sendTransactionalEmail } from '../services/transactionalEmailService.js';

test('an explicit Gmail sender never falls back to an admin or SMTP', async () => {
    const originalSendEmail = gmailOAuthService.sendEmail;
    const senderIds = [];
    gmailOAuthService.sendEmail = async (senderId) => {
        senderIds.push(senderId);
        const error = new Error('Google authorization is required');
        error.code = 'GMAIL_REAUTH_REQUIRED';
        error.statusCode = 401;
        throw error;
    };

    try {
        await assert.rejects(
            sendTransactionalEmail({
                to: 'student@example.test',
                subject: 'Practice task',
                text: 'A practice task is ready.',
                schoolId: 'school-id',
                preferredUserId: 'teacher-id',
                allowAdminFallback: true,
                allowSmtp: true
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
