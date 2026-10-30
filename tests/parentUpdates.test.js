import assert from 'node:assert/strict';
import test from 'node:test';
import Student from '../models/Student.js';
import Notification from '../models/Notification.js';
import { markParentUpdateAsRead } from '../services/parentDashboardService.js';

const parentUser = { _id: 'parent-1', email: 'Parent@Example.com ' };

const chain = (rows) => ({
    select() { return this; },
    populate() { return this; },
    sort() { return this; },
    lean: async () => rows,
});

test('marking one update as read is scoped to the parent and linked children', async (t) => {
    t.mock.method(Student, 'find', () => chain([
        { _id: 'student-1', firstName: 'Test', lastName: 'Student' },
    ]));
    let capturedFilter = null;
    let capturedUpdate = null;
    t.mock.method(Notification, 'findOneAndUpdate', (filter, update) => {
        capturedFilter = filter;
        capturedUpdate = update;
        return {
            lean: async () => ({ _id: 'update-1', readAt: new Date('2026-10-30T09:00:00Z') }),
        };
    });

    const result = await markParentUpdateAsRead({
        schoolId: 'school-1',
        parentUser,
        academicYear: '2026-2027',
        updateId: 'update-1',
    });

    assert.equal(result.updated, 1);
    assert.equal(capturedFilter._id, 'update-1');
    assert.equal(capturedFilter.school, 'school-1');
    assert.equal(capturedFilter.$and[0].$or[0].recipient, 'parent-1');
    assert.equal(capturedUpdate.$set.status, 'read');
    assert.ok(capturedUpdate.$set.readAt instanceof Date);
});

test('an unlinked parent cannot mark an update as read', async (t) => {
    t.mock.method(Student, 'find', () => chain([]));
    t.mock.method(Student, 'distinct', async () => []);
    let notificationTouched = false;
    t.mock.method(Notification, 'findOneAndUpdate', () => {
        notificationTouched = true;
        return { lean: async () => null };
    });

    const result = await markParentUpdateAsRead({
        schoolId: 'school-1',
        parentUser,
        academicYear: '2026-2027',
        updateId: 'update-1',
    });

    assert.equal(result, null);
    assert.equal(notificationTouched, false);
});
