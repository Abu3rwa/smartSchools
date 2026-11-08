import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssignmentReminderContent } from '../helpers/assignmentReminderLinks.js';

test('assignment reminder includes external links as plain text and structured links', () => {
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
    assert.deepEqual(result.links, [
        { title: 'Study guide', url: 'https://example.com/guide?a=1&b=2' },
        { title: 'example.org', url: 'https://example.org/resource' }
    ]);
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

    assert.deepEqual(result, { notificationText: 'Reminder.', links: [] });
});

test('assignment reminder appends Drive attachment links after external links', () => {
    const result = buildAssignmentReminderContent({
        reminderText: 'Reminder.',
        assignment: {
            links: [{ type: 'external_url', title: 'Guide', url: 'https://example.com/guide' }],
            driveAttachments: [
                { fileId: 'd1', fileName: 'Worksheet.pdf', webViewLink: 'https://drive.google.com/file/d/d1/view' },
                { fileId: 'd2', fileName: 'Unsafe', webViewLink: 'javascript:alert(1)' },
                { fileId: 'd3', fileName: 'No link' }
            ]
        }
    });

    assert.deepEqual(result.links, [
        { title: 'Guide', url: 'https://example.com/guide' },
        { title: 'Worksheet.pdf', url: 'https://drive.google.com/file/d/d1/view' }
    ]);
    assert.match(result.notificationText, /Worksheet\.pdf: https:\/\/drive\.google\.com\/file\/d\/d1\/view/);
});

test('a Drive-only assignment still gets a links block in the reminder', () => {
    const result = buildAssignmentReminderContent({
        reminderText: 'Reminder.',
        assignment: {
            driveAttachments: [{ fileId: 'd1', fileName: '', webViewLink: 'https://drive.google.com/file/d/d1/view' }]
        }
    });

    assert.equal(result.links.length, 1);
    assert.equal(result.links[0].title, 'drive.google.com');
    assert.match(result.notificationText, /Assignment links:/);
});

test('a reminder includes the published Google Classroom coursework link', () => {
    const result = buildAssignmentReminderContent({
        reminderText: 'Reminder.',
        assignment: { links: [{ type: 'external_url', title: 'Guide', url: 'https://example.com/guide' }] },
        classroomUrl: 'https://classroom.google.com/c/course-1/a/coursework-1'
    });

    assert.deepEqual(result.links.map((link) => link.url), [
        'https://example.com/guide',
        'https://classroom.google.com/c/course-1/a/coursework-1'
    ]);
    assert.equal(result.links[1].title, 'Google Classroom');
    assert.match(
        result.notificationText,
        /Google Classroom: https:\/\/classroom\.google\.com\/c\/course-1\/a\/coursework-1/
    );
});

test('an unsafe or duplicated Classroom URL is dropped', () => {
    const result = buildAssignmentReminderContent({
        reminderText: 'Reminder.',
        assignment: {
            links: [{ type: 'external_url', title: 'Classroom', url: 'https://classroom.google.com/c/course-1' }]
        },
        classroomUrl: 'https://classroom.google.com/c/course-1'
    });

    assert.equal(result.links.length, 1);

    const unsafe = buildAssignmentReminderContent({
        reminderText: 'Reminder.',
        assignment: {},
        classroomUrl: 'javascript:alert(1)'
    });
    assert.deepEqual(unsafe, { notificationText: 'Reminder.', links: [] });
});
