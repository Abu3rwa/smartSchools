import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import SupportRespondent from '../models/SupportRespondent.js';
import SupportSurvey from '../models/SupportSurvey.js';
import {
    PARENT_ROUND_ONE,
    TEACHER_ROUND_ONE,
    toSurveyQuestion,
} from '../services/supportLibrary.js';

const oid = () => new mongoose.Types.ObjectId();

const internalRespondent = (overrides = {}) => new SupportRespondent({
    school: oid(),
    kind: 'internal_teacher',
    teacher: oid(),
    codeHash: 'hashed-code',
    codeHint: '42',
    ...overrides,
});

const externalRespondent = (overrides = {}) => new SupportRespondent({
    school: oid(),
    kind: 'external_teacher',
    name: 'Rana Saleh',
    email: 'rana@example.com',
    codeHash: 'hashed-code',
    codeHint: '07',
    ...overrides,
});

const survey = (overrides = {}) => new SupportSurvey({
    school: oid(),
    cycle: oid(),
    student: oid(),
    subject: oid(),
    respondent: oid(),
    ...overrides,
});

test('a teacher survey carries its cycle, subject and respondent', () => {
    const doc = survey({
        questions: [{ id: 'q1', key: 'academic_effort', prompt: 'How consistently does this student finish classwork?' }],
        answers: [{ questionId: 'q1', scaleValue: 3 }],
    });
    assert.deepEqual(doc.validateSync(), undefined);
    assert.equal(doc.status, 'draft');
    assert.equal(doc.questionSource, 'fixed');
    assert.equal(doc.language, 'en');
    assert.equal(doc.round, 1);
});

test('a survey cannot exist without the student, subject or cycle it is about', () => {
    for (const field of ['school', 'cycle', 'student', 'subject', 'respondent']) {
        const doc = survey();
        doc[field] = undefined;
        assert.ok(doc.validateSync()?.errors[field], `${field} should be required`);
    }
});

test('question defaults describe how the answer is given', () => {
    const doc = survey({
        questions: [{ id: 'q1', key: 'academic_effort', prompt: 'How often is homework complete?' }],
    });
    assert.deepEqual(doc.validateSync(), undefined);
    const [question] = doc.questions;
    assert.equal(question.kind, 'scale');
    assert.equal(question.scaleMax, 4);
    assert.equal(question.domain, 'general');
    assert.equal(question.required, true);
    assert.equal(question.allowComment, false);
});

test('answers keep a scale, a choice and a written answer apart', () => {
    const doc = survey({
        questions: [
            { id: 'q1', key: 'effort', prompt: 'Effort', kind: 'scale' },
            { id: 'q2', key: 'focus', prompt: 'Focus', kind: 'choice', options: ['Rarely', 'Sometimes', 'Often'] },
            { id: 'q3', key: 'note', prompt: 'Anything else?', kind: 'text', required: false },
        ],
        answers: [
            { questionId: 'q1', scaleValue: 2 },
            { questionId: 'q2', choiceValue: 'Sometimes' },
            { questionId: 'q3', textValue: 'Better on project days.' },
        ],
    });
    assert.deepEqual(doc.validateSync(), undefined);
    assert.equal(doc.answers[0].scaleValue, 2);
    assert.equal(doc.answers[1].choiceValue, 'Sometimes');
    assert.equal(doc.answers[2].textValue, 'Better on project days.');
});

test('every library question id fits the survey schema', () => {
    for (const bank of [PARENT_ROUND_ONE, TEACHER_ROUND_ONE]) {
        const questions = bank.map((item) => toSurveyQuestion(item));
        const doc = survey({ audience: 'parent', subject: null, questions });
        assert.deepEqual(doc.validateSync(), undefined);
    }
});

test('an internal respondent needs the platform account it belongs to', () => {
    const doc = internalRespondent({ teacher: null });
    assert.ok(doc.validateSync()?.errors.teacher);
});

test('an external respondent needs a name and an email', () => {
    const doc = externalRespondent({ name: '', email: '' });
    const errors = doc.validateSync()?.errors;
    assert.ok(errors.name);
    assert.ok(errors.email);
});

test('the access code hash is never returned by a normal query', () => {
    assert.equal(SupportRespondent.schema.path('codeHash').options.select, false);
});

test('an external respondent stores the email lowercase', () => {
    const doc = externalRespondent({ email: 'Rana.Saleh@Example.COM' });
    assert.equal(doc.email, 'rana.saleh@example.com');
});

test('a parent respondent belongs to one student', () => {
    const doc = new SupportRespondent({
        school: oid(),
        kind: 'parent',
        student: oid(),
        codeHash: 'hashed-code',
        codeHint: '31',
    });
    assert.deepEqual(doc.validateSync(), undefined);

    const missingStudent = new SupportRespondent({
        school: oid(),
        kind: 'parent',
        codeHash: 'hashed-code',
        codeHint: '31',
    });
    assert.ok(missingStudent.validateSync()?.errors.student);
});

test('a parent survey needs no subject; a teacher survey does', () => {
    const parentSurvey = survey({ audience: 'parent', subject: null });
    assert.deepEqual(parentSurvey.validateSync(), undefined);

    const teacherSurvey = survey({ subject: null, audience: 'teacher' });
    assert.ok(teacherSurvey.validateSync()?.errors.subject);
});

test('questions keep the Arabic wording next to the English one', () => {
    const doc = survey({
        questions: [{
            id: 'q1',
            key: 'effort',
            prompt: 'How is effort?',
            promptAr: 'كيف هو الجهد؟',
            kind: 'choice',
            options: ['Low', 'High'],
            optionsAr: ['منخفض', 'مرتفع'],
        }],
    });
    assert.deepEqual(doc.validateSync(), undefined);
    assert.equal(doc.questions[0].promptAr, 'كيف هو الجهد؟');
    assert.deepEqual(doc.questions[0].optionsAr, ['منخفض', 'مرتفع']);
});
