import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildClassChips,
    buildDaySchedule,
    buildWeekSchedule,
    getInitial,
    getNextClass,
    getPerformanceTone,
    getSlotState,
    getWorkloadCeiling,
    toMinutes
} from './teacherDashboardPresentation.js';

const periods = [
    { _id: 'p1', order: 1, name: 'Period 1', startTime: '07:30', endTime: '08:15' },
    { _id: 'p2', order: 2, name: 'Period 2', startTime: '08:20', endTime: '09:05' },
    { _id: 'p3', order: 3, name: 'Period 3', startTime: '09:10', endTime: '09:55' },
    { _id: 'p5', order: 5, name: 'Period 5', startTime: '11:05', endTime: '11:50' }
];

const assignment = (id, period, daysOfWeek, className = 'Grade 5-R') => ({
    _id: id,
    period,
    daysOfWeek,
    subject: { name: 'Mathematics' },
    class: { name: className },
    room: { name: '12' }
});

const timetable = {
    periods,
    assignments: [
        assignment('a3', 'p3', [0, 1, 2, 3, 4]),
        assignment('a1', 'p1', [0, 2, 4]),
        assignment('a5', 'p5', [4], 'Grade 5-B'),
        assignment('a2', 'p2', [1, 3])
    ]
};

test('toMinutes parses HH:MM and rejects anything else', () => {
    assert.equal(toMinutes('07:30'), 450);
    assert.equal(toMinutes('00:00'), 0);
    assert.equal(toMinutes('23:59'), 1439);
    assert.equal(toMinutes('7:05'), 425);
    assert.equal(toMinutes('24:00'), null);
    assert.equal(toMinutes('12:60'), null);
    assert.equal(toMinutes('noon'), null);
    assert.equal(toMinutes(''), null);
    assert.equal(toMinutes(null), null);
    assert.equal(toMinutes(450), null);
});

test('buildDaySchedule keeps only that day and sorts by period order', () => {
    const rows = buildDaySchedule(timetable, 4);
    assert.deepEqual(rows.map((row) => row._id), ['a1', 'a3', 'a5']);
    assert.deepEqual(rows.map((row) => row.order), [1, 3, 5]);
    assert.equal(rows[0].startTime, '07:30');
    assert.equal(rows[0].endTime, '08:15');
});

test('buildDaySchedule treats an assignment with no days as every day', () => {
    const rows = buildDaySchedule({ periods, assignments: [assignment('always', 'p2', [])] }, 6);
    assert.deepEqual(rows.map((row) => row._id), ['always']);
});

test('buildDaySchedule resolves a populated period object', () => {
    const rows = buildDaySchedule({
        periods: [],
        assignments: [{ _id: 'pop', period: periods[2], daysOfWeek: [0] }]
    }, 0);
    assert.equal(rows[0].order, 3);
    assert.equal(rows[0].startTime, '09:10');
});

test('buildDaySchedule survives an empty or missing timetable', () => {
    assert.deepEqual(buildDaySchedule(undefined, 0), []);
    assert.deepEqual(buildDaySchedule({ periods: [], assignments: [] }, 0), []);
});

test('buildWeekSchedule always shows Sun-Thu and adds weekend days only when used', () => {
    assert.deepEqual(buildWeekSchedule(timetable).map((entry) => entry.day), [0, 1, 2, 3, 4]);

    const withFriday = {
        periods,
        assignments: [...timetable.assignments, assignment('fri', 'p1', [5])]
    };
    assert.deepEqual(buildWeekSchedule(withFriday).map((entry) => entry.day), [0, 1, 2, 3, 4, 5]);
    assert.equal(buildWeekSchedule(withFriday)[5].rows.length, 1);
});

test('getSlotState marks past, now and upcoming against the clock', () => {
    const row = { startTime: '09:10', endTime: '09:55' };
    assert.equal(getSlotState(row, 9 * 60), 'upcoming');
    assert.equal(getSlotState(row, 9 * 60 + 10), 'now');
    assert.equal(getSlotState(row, 9 * 60 + 54), 'now');
    assert.equal(getSlotState(row, 9 * 60 + 55), 'past');
});

test('getSlotState leaves untimed periods upcoming rather than guessing', () => {
    assert.equal(getSlotState({ startTime: null, endTime: null }, 600), 'upcoming');
    assert.equal(getSlotState(undefined, 600), 'upcoming');
});

test('getNextClass returns the running class with a live flag', () => {
    const rows = buildDaySchedule(timetable, 4);
    const next = getNextClass(rows, 9 * 60 + 20);
    assert.equal(next.row._id, 'a3');
    assert.equal(next.live, true);
    assert.equal(next.minutesUntil, 0);
});

test('getNextClass counts down to the next class after a free period', () => {
    const rows = buildDaySchedule(timetable, 4);
    const next = getNextClass(rows, 10 * 60);
    assert.equal(next.row._id, 'a5');
    assert.equal(next.live, false);
    assert.equal(next.minutesUntil, 65);
});

test('getNextClass returns null once the teaching day is over', () => {
    const rows = buildDaySchedule(timetable, 4);
    assert.equal(getNextClass(rows, 12 * 60), null);
    assert.equal(getNextClass([], 400), null);
});

test('getNextClass offers the first untimed class without a countdown', () => {
    const rows = buildDaySchedule({
        periods: [{ _id: 'x', order: 1 }],
        assignments: [assignment('untimed', 'x', [0])]
    }, 0);
    const next = getNextClass(rows, 600);
    assert.equal(next.row._id, 'untimed');
    assert.equal(next.minutesUntil, null);
    assert.equal(next.live, false);
});

test('buildClassChips dedupes class+subject pairs and caps the list', () => {
    const assigned = [
        { class: { name: 'Grade 5-R' }, subject: { name: 'Mathematics' } },
        { class: { name: 'Grade 5-R' }, subject: { name: 'Mathematics' } },
        { class: { name: 'Grade 5-B' }, subject: { name: 'Mathematics' } },
        { class: { name: 'Grade 5-R' }, subject: { name: 'Science' } },
        { class: null, subject: { name: 'Orphan' } },
        { class: { name: 'Grade 6-A' } },
        { class: { name: 'Grade 6-B' } }
    ];
    const chips = buildClassChips(assigned);
    assert.equal(chips.length, 4);
    assert.deepEqual(chips.map((chip) => chip.className), ['Grade 5-R', 'Grade 5-B', 'Grade 5-R', 'Grade 6-A']);
    assert.equal(chips[3].subjectName, '');
    assert.equal(buildClassChips(assigned, 2).length, 2);
    assert.deepEqual(buildClassChips(undefined), []);
});

test('getPerformanceTone follows the 75 / 60 thresholds shown in the legend', () => {
    assert.equal(getPerformanceTone(100), 'emerald');
    assert.equal(getPerformanceTone(75), 'emerald');
    assert.equal(getPerformanceTone(74), 'teal');
    assert.equal(getPerformanceTone(60), 'teal');
    assert.equal(getPerformanceTone(59), 'amber');
    assert.equal(getPerformanceTone(0), 'amber');
    assert.equal(getPerformanceTone(undefined), 'amber');
});

test('getWorkloadCeiling keeps the four axis labels whole numbers', () => {
    assert.equal(getWorkloadCeiling([4, 5, 4, 5, 3, 0, 0]), 6);
    assert.equal(getWorkloadCeiling([]), 6);
    assert.equal(getWorkloadCeiling([0, 0]), 6);
    [7, 9, 12, 13].forEach((max) => {
        const ceiling = getWorkloadCeiling([max]);
        assert.ok(ceiling >= max);
        assert.equal(ceiling % 3, 0);
        assert.equal((ceiling * 2) % 3, 0);
    });
});

test('getInitial takes the first character and survives an empty name', () => {
    assert.equal(getInitial('Layla A.'), 'L');
    assert.equal(getInitial('  omar  '), 'O');
    assert.equal(getInitial('ليلى'), 'ل');
    assert.equal(getInitial(''), '—');
    assert.equal(getInitial(null), '—');
});