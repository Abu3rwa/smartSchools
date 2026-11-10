import assert from 'node:assert/strict';
import test from 'node:test';

import {
    normalizeScheduleDraft,
    parseWeekday,
    stripStaffNames,
    to24Hour
} from '../services/timetable/scheduleImport/scheduleExtraction.js';
import { matchScheduleDraft } from '../services/timetable/scheduleImport/scheduleMatching.js';
import {
    normalizeCommitRows,
    normalizeSubjectsToCreate
} from '../services/timetable/scheduleImport/analyzeService.js';

const periods = [
    { _id: 'p1', name: 'Period 1', startTime: '08:30', endTime: '09:25' },
    { _id: 'p2', name: 'Period 2', startTime: '09:25', endTime: '10:15' }
];

const classes = [
    { _id: 'c5r', name: '5-R', grade: 5, section: 'R' },
    { _id: 'c5b', name: '5-B', grade: 5, section: 'B' }
];

const subjects = [
    { _id: 'ss5', name: 'Social Studies', code: 'SS5', isActive: true },
    { _id: 'ela5', name: 'English Language Arts', code: 'ELA5', isActive: true },
    { _id: 'ar5', name: 'Arabic', code: 'AR5', isActive: false }
];

const draftWith = (cells, documentPeriods = [
    { index: 1, startTime: '08:30', endTime: '09:25' },
    { index: 2, startTime: '09:25', endTime: '10:15' }
]) => ({ sourceType: 'teacher', periods: documentPeriods, cells });

const cell = (overrides = {}) => ({
    id: 'cell-1',
    dayOfWeek: 0,
    day: 'Sunday',
    periodIndex: 1,
    title: 'Social Studies 5',
    code: 'SS 5R',
    grade: 5,
    section: 'R',
    kind: 'class',
    confidence: 0.9,
    reason: '',
    issues: [],
    ...overrides
});

test('to24Hour converts printed QuickSchools times', () => {
    assert.equal(to24Hour('08:30 AM'), '08:30');
    assert.equal(to24Hour('1:35 PM'), '13:35');
    assert.equal(to24Hour('12:45 PM'), '12:45');
    assert.equal(to24Hour('12:05 AM'), '00:05');
    assert.equal(to24Hour('13:35'), '13:35');
    assert.equal(to24Hour('25:00'), null);
    assert.equal(to24Hour('8:5'), null);
});

test('parseWeekday accepts names and numbers', () => {
    assert.equal(parseWeekday('Sunday'), 0);
    assert.equal(parseWeekday('thursday'), 4);
    assert.equal(parseWeekday(2), 2);
    assert.equal(parseWeekday('Funday'), null);
});

test('stripStaffNames removes school staff names, emails and header lines', () => {
    const text = 'Name: Abdulhafeez Alameen\nSunday Math 5 (MATH 5R)\nAyhaab Aboushoug\nadmin@amly.us';
    const cleaned = stripStaffNames(text, ['Abdulhafeez Alameen', 'Ayhaab Aboushoug']);
    assert.ok(!cleaned.toLowerCase().includes('abdulhafeez'));
    assert.ok(!cleaned.toLowerCase().includes('ayhaab'));
    assert.ok(!cleaned.includes('admin@amly.us'));
    assert.ok(cleaned.includes('Math 5'));
});

test('normalizeScheduleDraft validates the AI contract', () => {
    const draft = normalizeScheduleDraft({
        parsed: {
            sourceType: 'teacher',
            periods: [
                { startTime: '08:30 AM', endTime: '09:25 AM' },
                { startTime: '09:25', endTime: '10:15' }
            ],
            cells: [{
                day: 'Sunday',
                periodIndex: 1,
                title: 'Social Studies 5',
                code: '(SS 5R)',
                grade: '5th',
                section: '55R',
                kind: 'class',
                confidence: 2,
                reason: 'clear'
            }]
        }
    });

    assert.equal(draft.periods[0].startTime, '08:30');
    assert.equal(draft.cells[0].code, 'SS 5R');
    assert.equal(draft.cells[0].grade, 5);
    assert.equal(draft.cells[0].section, 'R');
    assert.equal(draft.cells[0].confidence, 1);
});

test('normalizeScheduleDraft rejects drafts it cannot place on a grid', () => {
    assert.throws(() => normalizeScheduleDraft({ parsed: { periods: [], cells: [] } }), /period times/i);
    assert.throws(() => normalizeScheduleDraft({
        parsed: { periods: [{ startTime: '08:30', endTime: '09:25' }], cells: [] }
    }), /No class periods/i);
    assert.throws(() => normalizeScheduleDraft({
        parsed: {
            sourceType: 'teacher',
            periods: [{ startTime: '25:00', endTime: '26:00' }],
            cells: [{ day: 'Sunday', periodIndex: 1, title: 'Math' }]
        }
    }), /invalid time/i);
    assert.throws(() => normalizeScheduleDraft({
        parsed: {
            sourceType: 'teacher',
            periods: [{ startTime: '08:30', endTime: '09:25' }],
            cells: Array.from({ length: 61 }, () => ({ day: 'Sunday', periodIndex: 1, title: 'Math' }))
        }
    }), /limit is 60/i);
});

test('matchScheduleDraft marks a fully matched cell ready', () => {
    const result = matchScheduleDraft({
        draft: draftWith([cell()]),
        periods,
        classes,
        subjects
    });

    assert.equal(result.cells[0].status, 'ready');
    assert.equal(result.cells[0].class.id, 'c5r');
    assert.equal(result.cells[0].subject.id, 'ss5');
    assert.equal(result.summary.canCommit, true);
});

test('matchScheduleDraft resolves printed codes with section suffixes', () => {
    const result = matchScheduleDraft({
        draft: draftWith([cell({ title: 'English Language Arts 5', code: 'ELA 5B', section: 'B' })]),
        periods,
        classes,
        subjects
    });

    assert.equal(result.cells[0].subject.id, 'ela5');
    assert.equal(result.cells[0].class.id, 'c5b');
    assert.equal(result.cells[0].status, 'ready');
});

test('matchScheduleDraft blocks unknown classes and periods', () => {
    const unknownClass = matchScheduleDraft({
        draft: draftWith([cell({ section: 'Y' })]),
        periods,
        classes,
        subjects
    });
    assert.equal(unknownClass.cells[0].status, 'needs_class');
    assert.equal(unknownClass.summary.canCommit, false);

    const unknownPeriod = matchScheduleDraft({
        draft: draftWith([cell()], [{ index: 1, startTime: '07:10', endTime: '08:00' }]),
        periods,
        classes,
        subjects
    });
    assert.equal(unknownPeriod.cells[0].status, 'needs_period');
});

test('matchScheduleDraft proposes a new subject once across cells', () => {
    const result = matchScheduleDraft({
        draft: draftWith([
            cell({ id: 'cell-1', title: 'Robotics 5', code: 'ROB 5R' }),
            cell({ id: 'cell-2', periodIndex: 2, title: 'Robotics 5', code: 'ROB 5R' })
        ]),
        periods,
        classes,
        subjects
    });

    assert.equal(result.cells[0].status, 'will_create_subject');
    assert.deepEqual(result.subjectProposals, [{ name: 'Robotics', code: 'ROB', cells: 2 }]);
    assert.equal(result.summary.willCreateSubject, 2);
});

test('matchScheduleDraft skips meetings, keeps empties empty and forces low confidence to a decision', () => {
    const result = matchScheduleDraft({
        draft: draftWith([
            cell({ id: 'cell-1', kind: 'meeting', title: 'MS CL Meeting', code: 'MS CL TM 5', grade: null, section: null }),
            cell({ id: 'cell-2', kind: 'empty', title: '', code: '', grade: null, section: null, periodIndex: 2 }),
            cell({ id: 'cell-3', confidence: 0.2 })
        ]),
        periods,
        classes,
        subjects
    });

    assert.equal(result.cells[0].status, 'skipped');
    assert.equal(result.cells[1].status, 'empty');
    assert.equal(result.cells[2].status, 'needs_decision');
});

test('matchScheduleDraft treats an inactive subject as a decision, not a silent match', () => {
    const result = matchScheduleDraft({
        draft: draftWith([cell({ title: 'Arabic 5', code: 'AR 5R' })]),
        periods,
        classes,
        subjects
    });

    assert.equal(result.cells[0].subject.id, 'ar5');
    assert.equal(result.cells[0].status, 'needs_decision');
});

test('normalizeCommitRows rejects bad rows and dedupes identical slots', () => {
    const rows = normalizeCommitRows([
        { day: 'Sunday', startTime: '08:30', endTime: '09:25', sessionType: 'class', courseName: 'SS5', grade: 5, section: 'R' },
        { day: 'Sunday', startTime: '08:30', endTime: '09:25', sessionType: 'class', courseName: 'SS5', grade: 5, section: 'R' },
        { day: 'Sunday', startTime: '08:30', endTime: '09:25', sessionType: 'admin' }
    ]);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].day, 'Sunday');
    assert.equal(rows[1].sessionType, 'admin');

    assert.throws(() => normalizeCommitRows([]), /no reviewed rows/i);
    assert.throws(() => normalizeCommitRows([
        { day: 'Funday', startTime: '08:30', endTime: '09:25' }
    ]), /invalid day or time/i);
    assert.throws(() => normalizeCommitRows([
        { day: 'Sunday', startTime: '08:30', endTime: '09:25', sessionType: 'class', courseName: '', grade: 5, section: 'R' }
    ]), /missing its class or subject/i);
    assert.throws(() => normalizeCommitRows(
        Array.from({ length: 201 }, () => ({ day: 'Sunday', startTime: '08:30', endTime: '09:25', sessionType: 'admin' }))
    ), /Too many rows/i);
});

test('normalizeSubjectsToCreate uppercases, caps and dedupes exact codes', () => {
    const subjectsToCreate = normalizeSubjectsToCreate([
        { name: 'Robotics 5', code: 'rob 5' },
        { name: 'Robotics', code: 'ROB 5' }
    ]);

    assert.deepEqual(subjectsToCreate, [{ name: 'Robotics 5', code: 'ROB 5' }]);
    assert.throws(() => normalizeSubjectsToCreate([{ name: '', code: '' }]), /name and a code/i);
    assert.throws(() => normalizeSubjectsToCreate(
        Array.from({ length: 21 }, (_, index) => ({ name: `S${index}`, code: `C${index}` }))
    ), /Too many new subjects/i);
});
