import assert from 'node:assert/strict';
import test from 'node:test';

import {
    analyzeSurveys,
    missingRequiredQuestions,
} from '../services/supportPlanBuilder.js';
import {
    SURVEY_TRANSITIONS,
    reopenSurvey,
    surveyTransitionAllowed,
} from '../services/supportSurveyService.js';
import { surveyPeriod } from '../services/supportSelectionService.js';

/* --------------------------- transition policy ----------------------------- */

test('submitted is a terminal survey state', () => {
    assert.deepEqual(SURVEY_TRANSITIONS.submitted, []);
    assert.equal(surveyTransitionAllowed('submitted', 'opened'), false);
    assert.equal(surveyTransitionAllowed('submitted', 'skipped'), false);
});

test('a skipped survey reopens but cannot be submitted directly', () => {
    assert.equal(surveyTransitionAllowed('skipped', 'opened'), true);
    assert.equal(surveyTransitionAllowed('skipped', 'submitted'), false);
});

test('a cancelled survey only returns through the re-prepare revive', () => {
    assert.deepEqual(SURVEY_TRANSITIONS.cancelled, ['draft']);
    assert.equal(surveyTransitionAllowed('cancelled', 'opened'), false);
    assert.equal(surveyTransitionAllowed('cancelled', 'submitted'), false);
});

test('the answering path draft -> sent -> opened -> submitted is legal', () => {
    assert.equal(surveyTransitionAllowed('draft', 'sent'), true);
    assert.equal(surveyTransitionAllowed('sent', 'opened'), true);
    assert.equal(surveyTransitionAllowed('opened', 'submitted'), true);
    assert.equal(surveyTransitionAllowed('opened', 'skipped'), true);
});

/* ------------------------------- reopen (Q7) ------------------------------- */

const stubSurvey = (overrides = {}) => ({
    status: 'skipped',
    dueDate: null,
    revision: 3,
    openedAt: null,
    save: async function save() { this.saved = true; },
    ...overrides,
});

const yesterday = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setHours(12, 0, 0, 0);
    return date;
};

test('a respondent reopens their own skipped survey before the due date', async () => {
    const survey = stubSurvey({ dueDate: new Date(Date.now() + 86_400_000) });
    const saved = await reopenSurvey({ survey, actorKind: 'respondent' });
    assert.equal(saved.status, 'opened');
    assert.equal(saved.revision, 4);
    assert.equal(saved.saved, true);
});

test('a respondent cannot reopen after the due date has passed', async () => {
    const survey = stubSurvey({ dueDate: yesterday() });
    await assert.rejects(
        () => reopenSurvey({ survey, actorKind: 'respondent' }),
        (error) => error.code === 'SURVEY_DUE_PASSED' && error.status === 403,
    );
});

test('a respondent can reopen when the survey has no due date', async () => {
    const survey = stubSurvey();
    const saved = await reopenSurvey({ survey, actorKind: 'respondent' });
    assert.equal(saved.status, 'opened');
});

test('staff reopen is allowed even after the due date', async () => {
    const survey = stubSurvey({ dueDate: yesterday() });
    const saved = await reopenSurvey({ survey, actorKind: 'staff' });
    assert.equal(saved.status, 'opened');
});

test('reopen refuses surveys that are not skipped', async () => {
    const survey = stubSurvey({ status: 'submitted' });
    await assert.rejects(
        () => reopenSurvey({ survey, actorKind: 'staff' }),
        (error) => error.code === 'SURVEY_NOT_SKIPPED' && error.status === 409,
    );
});

/* --------------------- scoring identity (review period) -------------------- */

test('surveyPeriod reads the month off a populated review', () => {
    assert.deepEqual(
        surveyPeriod({ review: { month: 9, academicYear: '2026-2027' } }),
        { month: 9, academicYear: '2026-2027' },
    );
});

test('surveyPeriod falls back to a populated cycle so recency scoring works', () => {
    assert.deepEqual(
        surveyPeriod({ review: null, cycle: { month: 9, academicYear: '2026-2027' } }),
        { month: 9, academicYear: '2026-2027' },
    );
});

test('surveyPeriod returns null when nothing carries a period', () => {
    assert.equal(surveyPeriod({ review: null, cycle: null }), null);
    assert.equal(surveyPeriod({}), null);
});

/* ------------------------------ analyzeSurveys ----------------------------- */

test('student surveys no longer inflate the teacher count', () => {
    const analysis = analyzeSurveys([
        { status: 'submitted', audience: 'teacher', questions: [], answers: [] },
        { status: 'submitted', audience: 'parent', questions: [], answers: [] },
        { status: 'submitted', audience: 'student', questions: [], answers: [] },
    ]);
    assert.equal(analysis.teacherCount, 1);
    assert.equal(analysis.parentCount, 1);
});

test('a lowest answer scores 0 while an unanswered question is skipped', () => {
    const analysis = analyzeSurveys([
        {
            status: 'submitted',
            audience: 'teacher',
            questions: [
                { id: 'q1', key: 'effort', kind: 'scale', scaleMax: 4, required: true },
                { id: 'q2', key: 'homework', kind: 'scale', scaleMax: 4, required: true },
            ],
            answers: [
                { questionId: 'q1', scaleValue: 1 },
            ],
        },
    ]);
    const effort = analysis.scores.find((row) => row.key === 'effort');
    assert.equal(effort.score, 0);
    assert.equal(analysis.scores.find((row) => row.key === 'homework'), undefined);
});

test('choiceIndex 0 counts as answered and text answers become comments', () => {
    const analysis = analyzeSurveys([
        {
            status: 'submitted',
            audience: 'parent',
            questions: [
                { id: 'c1', key: 'effort', kind: 'choice', options: ['Always', 'Sometimes', 'Never'], required: true },
                { id: 't1', key: 'routine', kind: 'text', required: false, allowComment: true },
            ],
            answers: [
                { questionId: 'c1', choiceIndex: 0, choiceValue: '' },
                { questionId: 't1', textValue: 'Needs a reading routine at home.' },
            ],
        },
    ]);
    const effort = analysis.scores.find((row) => row.key === 'effort');
    assert.equal(effort.score, 0);
    assert.deepEqual(analysis.comments, [
        { questionId: 't1', audience: 'parent', text: 'Needs a reading routine at home.' },
    ]);
});

/* --------------------- completeness parity for assisted -------------------- */

test('missingRequiredQuestions keeps null, zero and blank text distinct', () => {
    const survey = {
        questions: [
            { id: 'q1', required: true },
            { id: 'q2', required: true },
            { id: 'q3', required: true },
            { id: 'q4', required: true },
        ],
        answers: [
            { questionId: 'q2', scaleValue: null, choiceIndex: 0 },
            { questionId: 'q3', scaleValue: 1 },
            { questionId: 'q4', textValue: '   ' },
        ],
    };
    assert.deepEqual(missingRequiredQuestions(survey), ['q1', 'q4']);
});
