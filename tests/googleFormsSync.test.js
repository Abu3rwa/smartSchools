import assert from 'node:assert/strict';
import test from 'node:test';
import process from 'node:process';
import { google } from 'googleapis';
import GoogleFormSubmission from '../models/GoogleFormSubmission.js';
import GoogleFormGrading from '../models/GoogleFormGrading.js';
import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import googleFormsOAuthService from '../services/googleFormsOAuthService.js';
import {
    googleFormResponseVersion,
    listGoogleQuizSubmissions,
    syncGoogleQuizResponses
} from '../services/googleFormsAssignmentService.js';

const ENV_KEYS = ['GOOGLE_FORMS_ENABLED', 'GOOGLE_FORMS_SCHOOL_IDS'];

const withFormsEnabled = (t) => {
    const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    process.env.GOOGLE_FORMS_ENABLED = 'true';
    delete process.env.GOOGLE_FORMS_SCHOOL_IDS;
    t.after(() => {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    });
};

const objectiveQuestions = [
    { questionId: 'q1', itemId: 'i1', title: 'Pick one', type: 'multiple_choice', points: 2 }
];
const mixedQuestions = [
    ...objectiveQuestions,
    { questionId: 'q2', itemId: 'i2', title: 'Explain.', type: 'short_answer', points: 1, modelAnswer: 'Because particles move.', rubric: '' }
];

const makeAssignment = (questions, objectivePoints) => ({
    _id: 'assignment-1',
    title: 'Quiz',
    instructions: '',
    maxMarks: 10,
    academicYear: '2026-2027',
    class: 'class-1',
    subject: 'subject-1',
    teacher: 'teacher-1',
    scope: 'class',
    dueDate: null,
    lessonPlanIds: [],
    assignmentTypeKey: 'quiz',
    metadata: { googleForm: { formId: 'form-1', ownerUserId: 'user-1', objectivePoints, questions } }
});

const makeResponse = (values = { q1: 'A', q2: 'Because particles move.' }) => ({
    responseId: 'resp-1',
    respondentEmail: 'student@school.test',
    lastSubmittedTime: '2026-11-01T10:00:00Z',
    totalScore: 2,
    answers: Object.fromEntries(Object.entries(values).map(([questionId, value]) => [
        questionId,
        { textAnswers: { answers: [{ value }] } }
    ]))
});

const students = [{
    _id: 'student-1',
    user: { email: 'student@school.test' },
    studentEmail: '',
    email: '',
    firstName: 'Test',
    lastName: 'Student'
}];

const setup = (t, {
    questions = objectiveQuestions,
    objectivePoints = 2,
    responses = [makeResponse()],
    previousSubmission = null,
    gradingDoc = null,
    existingGrade = null
} = {}) => {
    withFormsEnabled(t);
    const calls = { submissions: [], gradingUpdates: [], grades: [] };
    const formsApi = {
        forms: {
            get: async () => ({ data: { settings: { emailCollectionType: 'VERIFIED' } } }),
            responses: { list: async () => ({ data: { responses } }) }
        }
    };
    t.mock.method(google, 'forms', () => formsApi);
    t.mock.method(googleFormsOAuthService, 'getAuthorizedClient', async () => ({ auth: {}, user: { _id: 'user-1' } }));
    t.mock.method(Student, 'find', () => ({
        populate: () => ({ select: async () => students })
    }));
    t.mock.method(GoogleFormSubmission, 'findOne', () => ({
        select: () => ({ lean: async () => previousSubmission })
    }));
    t.mock.method(GoogleFormSubmission, 'findOneAndUpdate', async (filter, update) => {
        calls.submissions.push({ filter, update });
        return {};
    });
    t.mock.method(GoogleFormGrading, 'findOne', () => ({
        select: () => ({ lean: async () => gradingDoc })
    }));
    t.mock.method(GoogleFormGrading, 'updateOne', async (filter, update) => {
        calls.gradingUpdates.push({ filter, update });
        return {};
    });
    t.mock.method(Grade, 'findOne', () => ({
        select: () => ({ lean: async () => existingGrade })
    }));
    t.mock.method(Grade, 'findOneAndUpdate', async (filter, update) => {
        calls.grades.push({ filter, update });
        return {};
    });
    return { assignment: makeAssignment(questions, objectivePoints), calls };
};

const sync = (assignment) => syncGoogleQuizResponses({ assignment, actorId: 'user-1', schoolId: 'school-1' });

test('response fingerprints ignore answer order but change with content', () => {
    const a = [{ questionId: 'q1', values: ['One'] }, { questionId: 'q2', values: ['Two'] }];
    const b = [{ questionId: 'q2', values: ['Two'] }, { questionId: 'q1', values: ['One'] }];
    assert.equal(googleFormResponseVersion(a), googleFormResponseVersion(b));
    assert.notEqual(googleFormResponseVersion(a), googleFormResponseVersion([{ questionId: 'q1', values: ['Changed'] }]));
});

test('objective-only sync still imports and auto-grades (regression)', async (t) => {
    const { assignment, calls } = setup(t, { responses: [makeResponse({ q1: 'A' })] });
    const summary = await sync(assignment);

    assert.deepEqual(summary, { imported: 1, unmatched: 0, updatedGrades: 1 });
    assert.equal(calls.submissions.length, 1);
    assert.equal(calls.grades.length, 1);
    assert.equal(calls.grades[0].update.$set.gradingSource, 'google_forms');
    assert.equal(calls.grades[0].update.$set.marks, 10);
});

test('quizzes with short answers never auto-grade before approval', async (t) => {
    const { assignment, calls } = setup(t, { questions: mixedQuestions });
    const summary = await sync(assignment);

    assert.equal(summary.imported, 1);
    assert.equal(summary.updatedGrades, 0);
    assert.equal(calls.grades.length, 0);
    assert.equal(calls.submissions.length, 1);
    assert.equal(calls.submissions[0].update.$set.answers.length, 2);
});

test('a changed response marks suggested or approved grading stale without touching scores', async (t) => {
    for (const status of ['suggested', 'approved']) {
        const oldVersion = googleFormResponseVersion([
            { questionId: 'q1', values: ['A'] },
            { questionId: 'q2', values: ['An older answer.'] }
        ]);
        const { assignment, calls } = setup(t, {
            questions: mixedQuestions,
            gradingDoc: { _id: 'grading-1', status, responseVersion: oldVersion }
        });
        await sync(assignment);

        assert.equal(calls.gradingUpdates.length, 1);
        assert.deepEqual(calls.gradingUpdates[0].filter, { _id: 'grading-1' });
        assert.deepEqual(calls.gradingUpdates[0].update, { $set: { status: 'stale' } });
    }
});

test('an unchanged response leaves grading untouched and repeat syncs stay idempotent', async (t) => {
    const currentVersion = googleFormResponseVersion([
        { questionId: 'q1', values: ['A'] },
        { questionId: 'q2', values: ['Because particles move.'] }
    ]);
    const { assignment, calls } = setup(t, {
        questions: mixedQuestions,
        gradingDoc: { _id: 'grading-1', status: 'approved', responseVersion: currentVersion }
    });
    await sync(assignment);
    await sync(assignment);

    assert.equal(calls.gradingUpdates.length, 0);
    assert.equal(calls.submissions.length, 2);
});

test('sync never overwrites teacher-edited or approved review grades', async (t) => {
    for (const gradingSource of ['manual', 'google_forms_review']) {
        const { assignment, calls } = setup(t, {
            responses: [makeResponse({ q1: 'A' })],
            existingGrade: { _id: 'grade-1', gradingSource }
        });
        const summary = await sync(assignment);

        assert.equal(summary.updatedGrades, 0);
        assert.equal(calls.grades.length, 0);
    }
});

test('sync still refreshes grades it created itself', async (t) => {
    const { assignment, calls } = setup(t, {
        responses: [makeResponse({ q1: 'A' })],
        existingGrade: { _id: 'grade-1', gradingSource: 'google_forms' }
    });
    const summary = await sync(assignment);

    assert.equal(summary.updatedGrades, 1);
    assert.equal(calls.grades.length, 1);
});

test('unmatched respondents are counted and never stored', async (t) => {
    const stranger = { ...makeResponse({ q1: 'A' }), respondentEmail: 'stranger@elsewhere.test' };
    const { assignment, calls } = setup(t, { responses: [stranger] });
    const summary = await sync(assignment);

    assert.deepEqual(summary, { imported: 0, unmatched: 1, updatedGrades: 0 });
    assert.equal(calls.submissions.length, 0);
});

test('missing Google scores are stored as null and never graded', async (t) => {
    const response = { ...makeResponse({ q1: 'A' }), totalScore: undefined };
    const { assignment, calls } = setup(t, { responses: [response] });
    const summary = await sync(assignment);

    assert.equal(summary.updatedGrades, 0);
    assert.equal(calls.submissions[0].update.$set.score, null);
});

test('the response list exposes each student\'s grading status', async (t) => {
    withFormsEnabled(t);
    t.mock.method(GoogleFormSubmission, 'find', () => ({
        populate: () => ({
            sort: () => ({
                lean: async () => [
                    { _id: 'sub-1', student: { _id: 'student-1', firstName: 'Test', lastName: 'Student' }, status: 'submitted', answers: [] },
                    { _id: 'sub-2', student: { _id: 'student-2', firstName: 'Other', lastName: 'Student' }, status: 'submitted', answers: [] }
                ]
            })
        })
    }));
    t.mock.method(GoogleFormGrading, 'find', () => ({
        select: () => ({ lean: async () => [{ student: 'student-1', status: 'stale' }] })
    }));

    const rows = await listGoogleQuizSubmissions({ assignmentId: 'assignment-1', schoolId: 'school-1' });
    assert.equal(rows[0].gradingStatus, 'stale');
    assert.equal(rows[1].gradingStatus, null);
});