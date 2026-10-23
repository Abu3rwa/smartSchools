import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlpReportModel } from '../services/plpReportModel.js';
import { buildPlpReportHtml } from '../services/plpReportTemplate.js';

const record = {
    _id: 'record-1',
    academicYear: '2026-2027',
    cycle: { title: 'Round 2' },
    month: 10,
    theme: 'hope',
    level: 'emerging',
    status: 'submitted',
    awardDecision: 'selected',
    student: { firstName: 'Ava', lastName: 'Lee', studentId: 'GB-1042' },
    class: { name: 'Grade 5-A' },
    teacher: { firstName: 'Noor', lastName: 'Haddad' },
};

const model = (overrides = {}) => buildPlpReportModel({
    record,
    goals: [{
        _id: 'goal-1',
        goalType: 'character',
        title: 'Speak up politely',
        status: 'active',
        milestones: [{ title: 'Try once per lesson', status: 'pending' }],
        linkedPractice: [{ kind: 'spelling_session', targetId: 'session-1', label: 'Week 4 missed words', detail: '4 of 12 words missed', source: 'teacher' }],
    }],
    tasks: [{ _id: 'task-1', plpGoal: 'goal-1', title: 'Read aloud', status: 'completed', dueDate: new Date('2026-10-30T00:00:00.000Z') }],
    evidence: [{ _id: 'e1', type: 'observation', note: 'Asked for a turn.', traitId: { name: 'Respect' }, teacher: { firstName: 'Rami', lastName: 'Odeh' }, createdAt: new Date('2026-10-12T00:00:00.000Z') }],
    traitScores: [['Respect', 3.5]],
    generatedAt: new Date('2026-10-23T00:00:00.000Z'),
    ...overrides,
});

test('report html renders every section with human labels', () => {
    const html = buildPlpReportHtml(model());
    for (const expected of [
        'At a glance', 'Character strengths noticed', 'Trait scores', 'Goals and tasks', 'Observation log',
        'Ava Lee', 'Round 2', 'Sent for review', 'Selected for the award', 'Week 4 missed words', '4 of 12 words missed',
    ]) {
        assert.ok(html.includes(expected), `expected "${expected}" in the report`);
    }
    assert.ok(!/in_progress|not_selected|submitted_by_student/.test(html), 'raw enum values must not reach the report');
    assert.ok(html.includes('Ava Lee'), 'the student is named');
    assert.ok(!html.includes('Round Round 2'), 'the round is not named twice');
    assert.ok(!html.includes('Grade 5-A · Grade 5'), 'the grade is not repeated when the class already says it');
});

test('class label adds the grade only when the class name omits it', () => {
    const repeated = buildPlpReportModel({ record: { _id: 'r', class: { name: 'Grade 5-A', grade: '5' } } }).student.classLabel;
    const single = buildPlpReportModel({ record: { _id: 'r', class: { name: 'Blue Group', grade: '5' } } }).student.classLabel;
    assert.equal(repeated, 'Grade 5-A');
    assert.equal(single, 'Blue Group · Grade 5');
});

test('report html escapes text written by users', () => {
    const html = buildPlpReportHtml(model({
        evidence: [{ _id: 'e1', type: 'observation', note: '<img src=x onerror=alert(1)>', traitId: { name: '</td><td>Inject' }, createdAt: new Date('2026-10-12T00:00:00.000Z') }],
    }));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x'));
    assert.ok(html.includes('&lt;/td&gt;&lt;td&gt;Inject'));
});

test('long observation logs are truncated with a note about the rest', () => {
    const evidence = Array.from({ length: 45 }, (unused, index) => ({
        _id: `e${index}`,
        type: 'observation',
        note: `Entry ${index}`,
        traitId: { name: 'Kindness' },
        teacher: { firstName: 'Rami', lastName: 'Odeh' },
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
    }));
    const html = buildPlpReportHtml(model({ evidence }));
    assert.equal(html.match(/Entry \d+/g).length, 40, 'only 40 log rows are printed');
    assert.match(html, /5 earlier entries are not printed here/);
});

test('an empty round still prints a friendly report', () => {
    const html = buildPlpReportHtml(buildPlpReportModel({ record: { _id: 'record-3', month: 1, student: {} } }));
    assert.match(html, /No positive observations have been recorded/);
    assert.match(html, /No trait scores have been saved/);
    assert.match(html, /No goals or tasks have been recorded/);
    assert.match(html, /Nothing has been recorded for this student yet/);
});
