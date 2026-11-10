import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CAPTURE_WINDOW_MINUTES,
    createTimetableCurrentPeriodService,
    isWithinCaptureWindow,
    resolveLocalClock,
} from '../services/timetable/currentPeriodService.js';

const PERIODS = [
    { _id: 'p1', name: 'Period 1', startTime: '08:00', endTime: '08:45', order: 1 },
    { _id: 'p2', name: 'Period 2', startTime: '10:00', endTime: '10:45', order: 2 },
    { _id: 'p3', name: 'Period 3', startTime: '11:00', endTime: '11:45', order: 3 },
];

const classDoc = { _id: 'class-5b', name: 'Grade 5B', grade: 5, section: 'B' };
const subjectDoc = { _id: 'subject-math', name: 'Mathematics', code: 'MATH' };

const assignmentFor = (period) => ({
    _id: `assignment-${period._id}`,
    grade: 5,
    period,
    class: classDoc,
    subject: subjectDoc,
    room: { _id: 'room-12', name: 'Room 12' },
});

const withQuery = (value) => {
    const chain = {
        select: () => chain,
        sort: () => chain,
        populate: () => chain,
        lean: async () => value,
    };
    return chain;
};

const buildService = ({ assignments = [], workingDays = [0, 1, 2, 3, 4, 5, 6], homeroomClassIds = [] } = {}) => createTimetableCurrentPeriodService({
    PeriodModel: { find: () => withQuery(PERIODS) },
    AssignmentModel: {
        find: () => withQuery(assignments),
        findOne: (filter) => withQuery(
            assignments.find((assignment) => (
                String(assignment.period?._id) === String(filter.period)
                && String(assignment.class?._id) === String(filter.class)
            )) || null
        ),
    },
    CalendarModel: { findOne: () => withQuery({ weekWorkingDays: workingDays }) },
    getHomeroomClassIds: async () => homeroomClassIds,
});

const LOCAL_TZ_OFFSET = new Date().getTimezoneOffset();

const clock = (hours, minutes) => {
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
};

test('capture window opens shortly before the lesson and closes shortly after', () => {
    assert.equal(isWithinCaptureWindow(600, 600, 645), true);
    assert.equal(isWithinCaptureWindow(600 - CAPTURE_WINDOW_MINUTES.before, 600, 645), true);
    assert.equal(isWithinCaptureWindow(600 - CAPTURE_WINDOW_MINUTES.before - 1, 600, 645), false);
    assert.equal(isWithinCaptureWindow(645 + CAPTURE_WINDOW_MINUTES.after, 600, 645), true);
    assert.equal(isWithinCaptureWindow(645 + CAPTURE_WINDOW_MINUTES.after + 1, 600, 645), false);
});

test('local clock uses the browser offset instead of the server timezone', () => {
    const instant = new Date(Date.UTC(2026, 10, 11, 7, 30));
    const eastOfUtc = resolveLocalClock(instant, -180);
    assert.equal(eastOfUtc.minutes, 10 * 60 + 30);

    const westOfUtc = resolveLocalClock(instant, 300);
    assert.equal(westOfUtc.minutes, 2 * 60 + 30);
});

test('the current timetable slot resolves the class, subject and the next lesson', async () => {
    const service = buildService({ assignments: [assignmentFor(PERIODS[1]), assignmentFor(PERIODS[2])] });

    const slot = await service.resolveSlot({
        schoolId: 'school-1',
        teacherId: 'teacher-1',
        at: clock(10, 20),
        tzOffset: LOCAL_TZ_OFFSET,
    });

    assert.equal(slot.status, 'in-class');
    assert.equal(slot.class.name, 'Grade 5B');
    assert.equal(slot.subject.name, 'Mathematics');
    assert.equal(slot.period.name, 'Period 2');
    assert.equal(slot.captureOpen, true);
    assert.equal(slot.nextPeriod.period.name, 'Period 3');
});

test('between lessons the slot reports the next scheduled assignment', async () => {
    const service = buildService({ assignments: [assignmentFor(PERIODS[1]), assignmentFor(PERIODS[2])] });

    const slot = await service.resolveSlot({
        schoolId: 'school-1',
        teacherId: 'teacher-1',
        at: clock(10, 50),
        tzOffset: LOCAL_TZ_OFFSET,
    });

    assert.equal(slot.status, 'free-period');
    assert.equal(slot.assignment, null);
    assert.equal(slot.captureOpen, false);
    assert.equal(slot.nextPeriod.period.name, 'Period 3');
});

test('a non-working day reports no lessons', async () => {
    const today = new Date().getDay();
    const workingDays = [0, 1, 2, 3, 4, 5, 6].filter((day) => day !== today);
    const service = buildService({ assignments: [assignmentFor(PERIODS[1])], workingDays });

    const slot = await service.resolveSlot({
        schoolId: 'school-1',
        teacherId: 'teacher-1',
        at: clock(10, 20),
        tzOffset: LOCAL_TZ_OFFSET,
    });

    assert.equal(slot.status, 'off-day');
    assert.equal(slot.captureOpen, false);
});

test('homeroom teachers keep class-wide capture access', async () => {
    const service = buildService({ homeroomClassIds: ['class-5b'] });

    const context = await service.assertCanCapture({
        user: { _id: 'teacher-1', school: 'school-1', role: 'teacher' },
        classId: 'class-5b',
        periodId: 'p2',
        at: clock(10, 20),
        tzOffset: LOCAL_TZ_OFFSET,
    });

    assert.equal(context.via, 'homeroom');
});

test('a scheduled class can be observed only inside its lesson window', async () => {
    const service = buildService({ assignments: [assignmentFor(PERIODS[1])] });
    const user = { _id: 'teacher-1', school: 'school-1', role: 'teacher' };

    const context = await service.assertCanCapture({
        user,
        classId: 'class-5b',
        periodId: 'p2',
        at: clock(10, 20),
        tzOffset: LOCAL_TZ_OFFSET,
    });
    assert.equal(context.via, 'timetable');
    assert.equal(context.subject.name, 'Mathematics');

    await assert.rejects(
        service.assertCanCapture({
            user,
            classId: 'class-5b',
            periodId: 'p2',
            at: clock(9, 0),
            tzOffset: LOCAL_TZ_OFFSET,
        }),
        (error) => error.statusCode === 403
    );
});

test('a class the teacher is not scheduled to teach is refused even with a period', async () => {
    const service = buildService({ assignments: [assignmentFor(PERIODS[1])] });

    await assert.rejects(
        service.assertCanCapture({
            user: { _id: 'teacher-1', school: 'school-1', role: 'teacher' },
            classId: 'class-7a',
            periodId: 'p2',
            at: clock(10, 20),
            tzOffset: LOCAL_TZ_OFFSET,
        }),
        (error) => error.statusCode === 403
    );
});
