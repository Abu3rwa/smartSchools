import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlpReportModel } from '../services/plpReportModel.js';

const RECORD = {
    _id: 'record-1',
    academicYear: '2026-2027',
    month: 10,
    theme: 'confidence',
    level: 'developing',
    status: 'in_progress',
    awardDecision: 'not_selected',
    awardDecisionReason: 'Attendance below the round requirement',
    student: { firstName: 'Ava', lastName: 'Lee', studentId: 'GB-1042' },
    class: { name: 'Grade 5-A', grade: '5' },
    teacher: { firstName: 'Noor', lastName: 'Haddad' },
    cycle: { title: 'Round 2', cycleCode: 'R2' },
};

const GOAL = {
    _id: 'goal-1',
    plpRecord: 'record-1',
    goalType: 'academic',
    title: 'Close the spelling gap',
    description: 'Practise the missed words twice a week.',
    status: 'active',
    targetDate: new Date('2026-11-30T00:00:00.000Z'),
    teacherProgressNote: 'Two of four sets attempted.',
    milestones: [{ title: 'Finish set 1', status: 'achieved', targetDate: new Date('2026-11-10T00:00:00.000Z') }],
    linkedPractice: [
        { kind: 'spelling_session', targetId: 'session-1', label: 'Stored label', detail: 'Stored detail', source: 'ai_suggested' },
        { kind: 'map_practice_plan', targetId: 'plan-9', label: 'Deleted plan', detail: '', source: 'teacher' },
    ],
};

const TASKS = [
    { _id: 'task-1', plpRecord: 'record-1', plpGoal: 'goal-1', title: 'Finish set 2', status: 'assigned', dueDate: new Date('2026-10-05T00:00:00.000Z'), teacherFeedback: 'Keep going' },
    { _id: 'task-2', plpRecord: 'record-1', plpGoal: 'goal-2', title: 'Orphan task', status: 'needs_revision' },
];

const EVIDENCE = [
    { _id: 'e1', plpRecord: 'record-1', type: 'observation', note: 'Volunteered to lead the group.', createdAt: new Date('2026-10-12T00:00:00.000Z'), traitId: { name: 'Courage' }, teacher: { firstName: 'Rami', lastName: 'Odeh' }, reviewStatus: 'confirmed' },
    { _id: 'e2', plpRecord: 'record-1', type: 'incident', note: 'Called out during the test.', createdAt: new Date('2026-10-13T00:00:00.000Z'), traitId: { name: 'Respect' }, teacher: null, reviewStatus: 'needs_review' },
];

const build = (overrides = {}) => buildPlpReportModel({
    record: RECORD,
    goals: [GOAL],
    tasks: TASKS,
    evidence: EVIDENCE,
    school: { name: 'Green Belt School' },
    traitScores: [['Courage', 4.2], ['Respect', null]],
    practiceItems: [{ kind: 'spelling_session', targetId: 'session-1', label: 'Fresh label', detail: 'Fresh detail' }],
    generatedAt: new Date('2026-10-23T00:00:00.000Z'),
    ...overrides,
});

test('report labels every enum and names the round and people', () => {
    const model = build();
    assert.equal(model.period.status, 'In progress');
    assert.equal(model.period.award, 'Not selected');
    assert.equal(model.period.level, 'Developing');
    assert.equal(model.period.theme, 'Confidence');
    assert.equal(model.period.round, 'Round 2');
    assert.equal(model.student.name, 'Ava Lee');
    assert.equal(model.student.className, 'Grade 5-A');
    assert.equal(model.student.grade, '5');
    assert.equal(model.observations[1].type, 'Incident');
    assert.equal(model.goals[0].type, 'Academic goal');
    assert.equal(model.goals[0].tasks.length, 1);
    assert.equal(model.goals[0].tasks[0].status, 'Assigned');
    assert.equal(model.unassignedTasks[0].title, 'Orphan task');
});

test('metrics count positive observations only and flag an overdue task', () => {
    const model = build();
    const byLabel = Object.fromEntries(model.metrics.map((metric) => [metric.label, metric.value]));
    assert.equal(byLabel['Positive observations'], '1');
    assert.equal(byLabel['Traits noticed'], '1');
    assert.equal(byLabel['Average trait score'], '4.2 / 5');
    assert.equal(model.traitTally.length, 1);
    assert.equal(model.traitTally[0].trait, 'Courage');
    assert.equal(model.scores.length, 1, 'null scores are dropped');
    assert.equal(model.counters.overdueTasks, 1);
    assert.equal(model.goals[0].tasks[0].isOverdue, true);
    assert.equal(model.observations[1].needsReview, true);
    assert.equal(model.observations[1].teacher, 'Recorded by teacher');
});

test('archived goals are excluded from the report', () => {
    const model = build({
        goals: [GOAL, { ...GOAL, _id: 'goal-9', title: 'Old goal', status: 'archived' }],
    });
    assert.deepEqual(model.goals.map((goal) => goal.title), ['Close the spelling gap']);
});

test('linked practice prefers the freshly resolved label and keeps stored text when it is gone', () => {
    const model = build();
    const [fresh, stale] = model.goals[0].practice;
    assert.equal(fresh.label, 'Fresh label');
    assert.equal(fresh.detail, 'Fresh detail');
    assert.equal(fresh.kind, 'Spelling session');
    assert.equal(fresh.source, 'Suggested by AI, confirmed by teacher');
    assert.equal(stale.label, 'Deleted plan');
    assert.equal(stale.kind, 'MAP practice plan');
});

test('empty rounds still produce a complete report model', () => {
    const model = buildPlpReportModel({
        record: { _id: 'record-2', academicYear: '2026-2027', month: 9, student: {}, status: 'submitted' },
        goals: [], tasks: [], evidence: [], traitScores: [], practiceItems: [],
    });
    assert.equal(model.period.status, 'Sent for review');
    assert.equal(model.period.round, 'September');
    assert.equal(model.student.name, 'Student');
    assert.deepEqual(model.traitTally, []);
    assert.deepEqual(model.goals, []);
    assert.equal(model.metrics[4].value, 'No scores yet');
});
