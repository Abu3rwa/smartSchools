import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import CalendarEvent from '../models/CalendarEvent.js';

const basePayload = () => ({
    school: new mongoose.Types.ObjectId(),
    title: 'Parent Teacher Meeting',
    category: 'MEETING',
    startAt: new Date('2026-02-18T09:00:00.000Z'),
    endAt: new Date('2026-02-18T10:00:00.000Z'),
    createdBy: new mongoose.Types.ObjectId()
});

test('CalendarEvent validation fails when endAt is before startAt', () => {
    const event = new CalendarEvent({
        ...basePayload(),
        endAt: new Date('2026-02-18T08:30:00.000Z')
    });
    const error = event.validateSync();
    assert.ok(error);
    assert.ok(error.errors.endAt);
});

test('CalendarEvent validation passes for multi-day events', () => {
    const event = new CalendarEvent({
        ...basePayload(),
        category: 'EVENT',
        startAt: new Date('2026-02-20T00:00:00.000Z'),
        endAt: new Date('2026-02-22T23:59:59.000Z')
    });
    const error = event.validateSync();
    assert.equal(error, undefined);
});

test('CalendarEvent validation passes for valid weekly recurrence', () => {
    const event = new CalendarEvent({
        ...basePayload(),
        recurrence: {
            isRecurring: true,
            frequency: 'WEEKLY',
            interval: 1,
            weekDays: [2, 4]
        }
    });
    const error = event.validateSync();
    assert.equal(error, undefined);
});

test('CalendarEvent validation fails for weekly recurrence without weekDays', () => {
    const event = new CalendarEvent({
        ...basePayload(),
        recurrence: {
            isRecurring: true,
            frequency: 'WEEKLY',
            interval: 1,
            weekDays: []
        }
    });
    const error = event.validateSync();
    assert.ok(error);
    assert.ok(error.errors.recurrence);
});
