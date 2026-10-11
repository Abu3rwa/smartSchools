import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssignmentReminderContent } from '../helpers/assignmentReminderLinks.js';

test('assignment reminder includes external links as plain text and clickable email links', () => {
    const result = buildAssignmentReminderContent({
        reminderText: 'Please complete the assignment.',
        assignment: {
            links: [
                { type: 'external_url', title: 'Study guide', url: 'https://example.com/guide?a=1&b=2' },
                { type: 'external_url', title: '', url: 'https://example.org/resource' },
                { type: 'assessment', title: 'Internal quiz', refId: 'quiz-1' }
            ]
        }
    });

    assert.equal(
        result.notificationText,
        'Please complete the assignment.\n\nAssignment links:\nStudy guide: https://example.com/guide?a=1&b=2\nexample.org: https://example.org/resource'
    );
    assert.match(
        result.linksHtml,
        /<a href="https:\/\/example\.com\/guide\?a=1&amp;b=2">Study guide<\/a>/
    );
    assert.match(
        result.linksHtml,
        /<a href="https:\/\/example\.org\/resource">example\.org<\/a>/
    );
    assert.doesNotMatch(result.linksHtml, /Internal quiz/);
});

test('assignment reminder omits unsupported and credentialed URLs', () => {
    const result = buildAssignmentReminderContent({
        reminderText: 'Reminder.',
        assignment: {
            links: [
                { type: 'external_url', title: 'Unsafe', url: 'javascript:alert(1)' },
                { type: 'external_url', title: 'Credentialed', url: 'https://user:pass@example.com/path' }
            ]
        }
    });

    assert.deepEqual(result, { notificationText: 'Reminder.', linksHtml: '' });
});
