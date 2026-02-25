import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildCalendarDateRange,
    buildCalendarEventListQuery,
    buildCalendarVisibilityQuery,
    canUserSeeEvent,
    parseCalendarCategories,
    sortCalendarEventsByStartAt
} from '../services/calendarService.js';

test('parseCalendarCategories returns normalized and deduplicated categories', () => {
    const categories = parseCalendarCategories('event, holiday, EVENT,invalid');
    assert.deepEqual(categories, ['EVENT', 'HOLIDAY']);
});

test('buildCalendarVisibilityQuery returns unrestricted query for admins', () => {
    const query = buildCalendarVisibilityQuery({
        user: { role: 'admin' },
        context: {}
    });
    assert.deepEqual(query, {});
});

test('buildCalendarVisibilityQuery scopes teacher to school-wide and teacher-visible events', () => {
    const query = buildCalendarVisibilityQuery({
        user: { role: 'teacher' },
        context: {
            teacherAudienceIds: ['user-1'],
            teacherClassIds: ['class-1']
        }
    });

    assert.ok(Array.isArray(query.$or));
    assert.ok(query.$or.some((item) => item['audience.visibility'] === 'SCHOOL_WIDE'));
    assert.ok(query.$or.some((item) => item['audience.visibility'] === 'TEACHERS_ONLY'));
});

test('buildCalendarEventListQuery applies school scoping and overlapping date filters', () => {
    const fromDate = new Date('2026-02-01T00:00:00.000Z');
    const toDate = new Date('2026-02-28T23:59:59.999Z');
    const query = buildCalendarEventListQuery({
        schoolId: 'school-1',
        fromDate,
        toDate,
        categories: ['EVENT'],
        status: 'ACTIVE',
        search: 'sports day',
        visibilityQuery: { 'audience.visibility': 'SCHOOL_WIDE' }
    });

    assert.equal(query.school, 'school-1');
    assert.equal(query.startAt.$lte.toISOString(), toDate.toISOString());
    assert.equal(query.endAt.$gte.toISOString(), fromDate.toISOString());
    assert.equal(query.status, 'ACTIVE');
    assert.deepEqual(query.category, { $in: ['EVENT'] });
});

test('canUserSeeEvent enforces parent and teacher visibility rules', () => {
    const customClassEvent = {
        audience: {
            visibility: 'CUSTOM',
            classIds: ['class-10']
        }
    };
    const parentsOnlyEvent = {
        audience: {
            visibility: 'PARENTS_ONLY'
        }
    };
    const teachersOnlyEvent = {
        audience: {
            visibility: 'TEACHERS_ONLY'
        }
    };

    assert.equal(canUserSeeEvent(
        { role: 'parent' },
        customClassEvent,
        { parentClassIds: ['class-10'] }
    ), true);

    assert.equal(canUserSeeEvent(
        { role: 'parent' },
        teachersOnlyEvent,
        { parentClassIds: ['class-10'] }
    ), false);

    assert.equal(canUserSeeEvent(
        { role: 'teacher' },
        parentsOnlyEvent,
        { teacherAudienceIds: ['teacher-user-1'] }
    ), false);
});

test('sortCalendarEventsByStartAt sorts upcoming events in ascending order', () => {
    const sorted = sortCalendarEventsByStartAt([
        { id: '3', startAt: '2026-02-20T09:00:00.000Z' },
        { id: '1', startAt: '2026-02-01T09:00:00.000Z' },
        { id: '2', startAt: '2026-02-12T09:00:00.000Z' }
    ]);
    assert.deepEqual(sorted.map((item) => item.id), ['1', '2', '3']);
});

test('buildCalendarDateRange defaults to current month when from/to are missing', () => {
    const now = new Date('2026-02-17T12:00:00.000Z');
    const range = buildCalendarDateRange({ now });
    assert.equal(range.fromDate.toISOString(), '2026-02-01T00:00:00.000Z');
    assert.equal(range.toDate.toISOString(), '2026-02-28T23:59:59.999Z');
});
