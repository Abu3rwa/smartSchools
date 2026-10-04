import test from 'node:test';
import assert from 'node:assert/strict';
import notificationService from '../services/notificationService.js';

const makeStudent = () => ({
    getAllContactEmailEntries: () => [
        { email: 'father@school.test', type: 'father' },
        { email: 'student@school.test', type: 'student' }
    ]
});

test('assignment parent recipients exclude the student email', () => {
    assert.deepEqual(
        notificationService._getParentContactEmails(makeStudent()),
        ['father@school.test']
    );
});

test('student assignment email is suppressed when an enabled parent recipient shares it', async () => {
    const originalResolveAudience = notificationService._resolveAssignmentAudience;
    notificationService._resolveAssignmentAudience = async () => ({
        parentRecipients: [{ email: 'student@school.test', emailEnabled: true }],
        fallbackEmails: []
    });

    try {
        assert.equal(
            await notificationService._shouldEmailStudentAssignmentNotice(
                {
                    getAllContactEmailEntries: () => [
                        { email: 'student@school.test', type: 'father' },
                        { email: 'student@school.test', type: 'student' }
                    ]
                },
                ' Student@School.Test '
            ),
            false
        );
    } finally {
        notificationService._resolveAssignmentAudience = originalResolveAudience;
    }
});

test('student assignment email remains enabled if the shared parent address opted out', async () => {
    const originalResolveAudience = notificationService._resolveAssignmentAudience;
    notificationService._resolveAssignmentAudience = async () => ({
        parentRecipients: [{ email: 'student@school.test', emailEnabled: false }],
        fallbackEmails: []
    });

    try {
        assert.equal(
            await notificationService._shouldEmailStudentAssignmentNotice(
                {
                    getAllContactEmailEntries: () => [
                        { email: 'student@school.test', type: 'father' },
                        { email: 'student@school.test', type: 'student' }
                    ]
                },
                'student@school.test'
            ),
            true
        );
    } finally {
        notificationService._resolveAssignmentAudience = originalResolveAudience;
    }
});
