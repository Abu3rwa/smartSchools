import assert from 'node:assert/strict';
import test from 'node:test';

import {
    analyzeSurveys,
    answerRatio,
    buildPlanDraft,
    missingRequiredQuestions,
    normalizeAnswer,
    pickFocusConcerns,
} from '../services/supportPlanBuilder.js';
import { PLAN_TEMPLATES } from '../services/supportLibrary.js';

const scaleQuestion = (id, key, domain = 'academic', scaleMax = 4) => ({
    id, key, domain, kind: 'scale', scaleMax, required: true, options: [],
});

const choiceQuestion = (id, key, domain = 'academic') => ({
    id, key, domain, kind: 'choice', options: ['Low', 'Middle', 'High'], required: true,
});

const textQuestion = (id, key = 'general') => ({
    id, key, domain: 'general', kind: 'text', required: false, options: [],
});

const survey = ({
    audience = 'teacher',
    status = 'submitted',
    questions = [],
    answers = [],
} = {}) => ({ audience, status, questions, answers });

test('a scale answer becomes a ratio against its own maximum', () => {
    assert.equal(answerRatio({ scaleValue: 1 }, scaleQuestion('q', 'effort')), 0);
    assert.equal(answerRatio({ scaleValue: 4 }, scaleQuestion('q', 'effort')), 1);
    assert.equal(answerRatio({ scaleValue: 3 }, scaleQuestion('q', 'effort')), 2 / 3);
    assert.equal(answerRatio({ scaleValue: 6 }, scaleQuestion('q', 'effort', 'academic', 5)), 1);
});

test('a choice answer scores by its position, not its words', () => {
    const question = choiceQuestion('q', 'understanding');
    assert.equal(answerRatio({ choiceIndex: 0 }, question), 0);
    assert.equal(answerRatio({ choiceIndex: 2 }, question), 1);
    assert.equal(answerRatio({ choiceValue: 'Middle' }, question), 0.5);
});

test('only submitted surveys count, and teachers and parents are counted apart', () => {
    const analysis = analyzeSurveys([
        survey({
            questions: [scaleQuestion('q1', 'effort')],
            answers: [{ questionId: 'q1', scaleValue: 2 }],
        }),
        survey({
            audience: 'parent',
            questions: [scaleQuestion('q1', 'effort')],
            answers: [{ questionId: 'q1', scaleValue: 4 }],
        }),
        survey({ status: 'sent', questions: [scaleQuestion('q1', 'effort')], answers: [] }),
    ]);
    assert.equal(analysis.teacherCount, 1);
    assert.equal(analysis.parentCount, 1);
    const effort = analysis.scores.find((entry) => entry.key === 'effort');
    assert.equal(effort.answers, 2);
    assert.equal(effort.score, 0.667);
});

test('written answers are collected as comments and never scored', () => {
    const analysis = analyzeSurveys([
        survey({
            questions: [textQuestion('q_note')],
            answers: [{ questionId: 'q_note', textValue: '  Needs a quiet seat.  ' }],
        }),
    ]);
    assert.equal(analysis.scores.length, 0);
    assert.deepEqual(analysis.comments.map((comment) => comment.text), ['Needs a quiet seat.']);
});

test('the focus goes to the lowest concerns and keeps academic and character together', () => {
    const scores = [
        { key: 'effort', domain: 'academic', score: 0.2 },
        { key: 'homework', domain: 'academic', score: 0.3 },
        { key: 'respect', domain: 'character', score: 0.6 },
        { key: 'reading', domain: 'academic', score: 0.8 },
    ];
    assert.deepEqual(pickFocusConcerns(scores, 2), ['effort', 'respect']);
    assert.deepEqual(pickFocusConcerns(scores, 3), ['effort', 'homework', 'respect']);
});

test('no submitted survey means no draft', () => {
    assert.equal(buildPlanDraft([]), null);
    assert.equal(buildPlanDraft([survey({ status: 'sent' })]), null);
});

test('a draft builds bilingual goals from the curated templates', () => {
    const draft = buildPlanDraft([
        survey({
            questions: [
                scaleQuestion('q1', 'effort'),
                choiceQuestion('q2', 'respect', 'character'),
            ],
            answers: [
                { questionId: 'q1', scaleValue: 1 },
                { questionId: 'q2', choiceIndex: 0 },
            ],
        }),
    ]);
    assert.deepEqual(draft.focusKeys, ['effort', 'respect']);
    assert.equal(draft.goals.length, 2);
    const [effort] = draft.goals;
    assert.equal(effort.id, 'goal_effort');
    assert.equal(effort.title, PLAN_TEMPLATES.effort.title.en);
    assert.equal(effort.titleAr, PLAN_TEMPLATES.effort.title.ar);
    assert.ok(effort.homeTasks.length > 0);
    assert.ok(effort.classTasks.every((task) => task.titleAr));
    assert.equal(draft.teacherCount, 1);
});

test('required questions are reported until they are answered', () => {
    const doc = {
        questions: [scaleQuestion('q1', 'effort'), textQuestion('q2')],
        answers: [],
    };
    assert.deepEqual(missingRequiredQuestions(doc), ['q1']);
    doc.answers = [{ questionId: 'q1', scaleValue: 3 }];
    assert.deepEqual(missingRequiredQuestions(doc), []);
});

test('answers are normalized to the question type and stay inside its range', () => {
    const scale = normalizeAnswer({ scaleValue: 9 }, scaleQuestion('q', 'effort'));
    assert.equal(scale.scaleValue, null);

    const choice = normalizeAnswer({ choiceIndex: 2 }, choiceQuestion('q', 'understanding'));
    assert.equal(choice.choiceIndex, 2);
    assert.equal(choice.choiceValue, 'High');

    const outOfRange = normalizeAnswer({ choiceIndex: 9 }, choiceQuestion('q', 'understanding'));
    assert.equal(outOfRange.choiceIndex, null);

    const text = normalizeAnswer({ textValue: '  hello  ' }, textQuestion('q'));
    assert.equal(text.textValue, 'hello');
});
