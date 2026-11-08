import assert from 'node:assert/strict';
import test from 'node:test';
import GoogleFormGrading from '../models/GoogleFormGrading.js';
import Grade from '../models/Grade.js';
import { googleFormResponseVersion } from '../services/googleFormsAssignmentService.js';
import { approveGoogleFormGrading } from '../services/googleFormsGradingService.js';

const assignment = {
    _id: 'assignment-1',
    title: 'States of matter',
    instructions: 'Answer both questions.',
    assignmentTypeKey: 'quiz',
    maxMarks: 10,
    subject: 'subject-1',
    class: 'class-1',
    teacher: 'teacher-1',
    academicYear: '2026-2027',
    lessonPlanIds: [],
    metadata: {
        googleForm: {
            objectivePoints: 2,
            questions: [
                { questionId: 'q1', type: 'multiple_choice', points: 2, title: 'Pick one' },
                { questionId: 'q2', type: 'short_answer', points: 2, title: 'Why do gases spread?', modelAnswer: 'Particles move quickly.' },
                { questionId: 'q3', type: 'short_answer', points: 1, title: 'Name a state of matter.', modelAnswer: 'Solid' }
            ]
        }
    }
};

const answers = [
    { questionId: 'q2', values: ['Because their particles move fast.'] },
    { questionId: 'q3', values: ['Liquid'] }
];

const makeSubmission = (overrides = {}) => ({
    _id: 'submission-1',
    school: 'school-1',
    student: 'student-1',
    score: 2,
    submittedAt: new Date('2026-11-01T10:00:00Z'),
    answers,
    ...overrides
});

const makeGrading = (overrides = {}) => ({
    _id: 'grading-1',
    status: 'suggested',
    responseVersion: googleFormResponseVersion(answers),
    questions: [
        { questionId: 'q2', maxPoints: 2, suggestedScore: 2, suggestedFeedback: 'Correct meaning.', approvedScore: null, approvedFeedback: '' },
        { questionId: 'q3', maxPoints: 1, suggestedScore: 0.5, suggestedFeedback: 'Partly right.', approvedScore: null, approvedFeedback: '' }
    ],
    ...overrides
});

const setup = (t, { existing = makeGrading() } = {}) => {
    const calls = { gradingWrites: [], gradeWrites: [] };
    t.mock.method(GoogleFormGrading, 'findOne', () => ({ lean: async () => existing }));
    t.mock.method(GoogleFormGrading, 'findOneAndUpdate', async (filter, update, options) => {
        calls.gradingWrites.push({ filter, update, options });
        return {};
    });
    t.mock.method(Grade, 'findOneAndUpdate', async (filter, update, options) => {
        calls.gradeWrites.push({ filter, update, options });
        return {};
    });
    return calls;
};

const approve = (questions, submission = makeSubmission()) =>
    approveGoogleFormGrading({ assignment, submission, actorId: 'user-1', questions });

const fullApproval = [
    { questionId: 'q2', score: 2, feedback: 'Correct meaning.' },
    { questionId: 'q3', score: 0.5, feedback: 'Partly right.' }
];

test('approval writes the combined objective + short-answer grade scaled to maxMarks', async (t) => {
    const calls = setup(t);
    const summary = await approve(fullApproval);

    assert.equal(summary.approved, true);
    assert.equal(summary.objectiveScore, 2);
    assert.equal(summary.objectiveMax, 2);
    assert.equal(summary.shortAnswerScore, 2.5);
    assert.equal(summary.shortAnswerMax, 3);
    assert.equal(summary.totalScore, 4.5);
    assert.equal(summary.totalMax, 5);
    assert.equal(summary.marks, 9);
    assert.equal(summary.maxMarks, 10);

    assert.equal(calls.gradeWrites.length, 1);
    const gradeSet = calls.gradeWrites[0].update.$set;
    assert.equal(gradeSet.marks, 9);
    assert.equal(gradeSet.maxMarks, 10);
    assert.equal(gradeSet.gradingSource, 'google_forms_review');
    assert.equal(gradeSet.gradeType, 'quiz');
    assert.equal(gradeSet.category, 'quiz');
    assert.equal(calls.gradeWrites[0].update.$setOnInsert.student, 'student-1');
});

test('approval records the teacher edits and marks the grading approved', async (t) => {
    const calls = setup(t);
    await approve([
        { questionId: 'q2', score: 1.5, feedback: 'Teacher adjusted.' },
        { questionId: 'q3', score: 1, feedback: 'Accepted.' }
    ]);

    const update = calls.gradingWrites[0].update.$set;
    assert.equal(update.status, 'approved');
    assert.equal(update.approvedBy, 'user-1');
    assert.ok(update.approvedAt instanceof Date);
    const q2 = update.questions.find((entry) => entry.questionId === 'q2');
    assert.equal(q2.approvedScore, 1.5);
    assert.equal(q2.approvedFeedback, 'Teacher adjusted.');
    assert.equal(q2.suggestedScore, 2);
    assert.equal(q2.suggestedFeedback, 'Correct meaning.');
});

test('a pure short-answer quiz grades from approved scores alone', async (t) => {
    const calls = setup(t, {
        existing: makeGrading({
            questions: [{ questionId: 'q2', maxPoints: 2, suggestedScore: 2, suggestedFeedback: '', approvedScore: null, approvedFeedback: '' }]
        })
    });
    const pureSa = {
        ...assignment,
        metadata: { googleForm: { objectivePoints: 0, questions: [assignment.metadata.googleForm.questions[1]] } }
    };
    const summary = await approveGoogleFormGrading({
        assignment: pureSa,
        submission: makeSubmission({ score: null }),
        actorId: 'user-1',
        questions: [{ questionId: 'q2', score: 1, feedback: 'Half credit.' }]
    });

    assert.equal(summary.objectiveMax, 0);
    assert.equal(summary.totalMax, 2);
    assert.equal(summary.marks, 5);
    assert.equal(calls.gradeWrites[0].update.$set.marks, 5);
});

test('approving before any AI grading is refused', async (t) => {
    const calls = setup(t, { existing: null });
    await assert.rejects(
        () => approve(fullApproval),
        (error) => error.code === 'NOT_GRADED' && error.statusCode === 409
    );
    assert.equal(calls.gradeWrites.length, 0);
});

test('a response that changed since grading must be regraded before approval', async (t) => {
    const calls = setup(t, { existing: makeGrading({ responseVersion: 'an-older-version' }) });
    await assert.rejects(
        () => approve(fullApproval),
        (error) => error.code === 'RESPONSE_CHANGED' && error.statusCode === 409
    );
    assert.equal(calls.gradeWrites.length, 0);
    assert.equal(calls.gradingWrites.length, 0);
});

test('a missing or out-of-range score blocks approval without writing a grade', async (t) => {
    const calls = setup(t);
    await assert.rejects(
        () => approve([{ questionId: 'q2', score: 2, feedback: 'ok' }]),
        (error) => error.code === 'INVALID_SCORE'
    );
    await assert.rejects(
        () => approve([{ questionId: 'q2', score: 9, feedback: 'too high' }, { questionId: 'q3', score: 1 }]),
        (error) => error.code === 'INVALID_SCORE'
    );
    assert.equal(calls.gradeWrites.length, 0);
});

test('an unavailable Google objective score blocks approval of a mixed quiz', async (t) => {
    const calls = setup(t);
    await assert.rejects(
        () => approve(fullApproval, makeSubmission({ score: null })),
        (error) => error.code === 'OBJECTIVE_SCORE_UNAVAILABLE' && error.statusCode === 409
    );
    assert.equal(calls.gradeWrites.length, 0);
});

test('quizzes without short answers refuse approval', async (t) => {
    setup(t);
    const objectiveOnly = { ...assignment, metadata: { googleForm: { objectivePoints: 2, questions: [assignment.metadata.googleForm.questions[0]] } } };
    await assert.rejects(
        () => approveGoogleFormGrading({ assignment: objectiveOnly, submission: makeSubmission(), actorId: 'user-1', questions: [] }),
        (error) => error.code === 'NO_SHORT_ANSWERS'
    );
});

test('the scaled grade is rounded to two decimals and capped at maxMarks', async (t) => {
    setup(t);
    const summary = await approve([
        { questionId: 'q2', score: 1.333, feedback: '' },
        { questionId: 'q3', score: 1, feedback: '' }
    ]);
    // objective 2 + SA 2.33 = 4.33 of 5 -> 8.66 of 10
    assert.equal(summary.shortAnswerScore, 2.33);
    assert.equal(summary.marks, 8.66);

    const capped = await approve([
        { questionId: 'q2', score: 2, feedback: '' },
        { questionId: 'q3', score: 1, feedback: '' }
    ]);
    assert.equal(capped.marks, 10);
});