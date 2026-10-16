import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildGoogleFormQuestionCsvTemplate,
    parseGoogleFormQuestionCsv
} from './googleFormQuestionCsv.js';

test('Google Forms question CSV template imports multiple-choice, true/false, and short-answer rows', () => {
    const questions = parseGoogleFormQuestionCsv(buildGoogleFormQuestionCsvTemplate());

    assert.equal(questions.length, 3);
    assert.deepEqual(questions[0], {
        type: 'multiple_choice',
        title: 'Which number is even?',
        options: ['3', '4', '5', '7'],
        correctAnswer: '4',
        points: 1
    });
    assert.equal(questions[1].correctAnswer, 'True');
    assert.equal(questions[2].type, 'short_answer');
    assert.equal(questions[2].points, 0);
});

test('imports the existing option_a through option_d question CSV layout and answer labels', () => {
    const csv = [
        'question_type,question_text,option_a,option_b,option_c,option_d,correct_answer',
        'mcq,"Which, option?",red,blue,green,yellow,C'
    ].join('\r\n');

    const [question] = parseGoogleFormQuestionCsv(csv);
    assert.equal(question.correctAnswer, 'green');
    assert.deepEqual(question.options, ['red', 'blue', 'green', 'yellow']);
});

test('rejects invalid choice answer, duplicate choices, and excessive question counts', () => {
    assert.throws(
        () => parseGoogleFormQuestionCsv('question_type,question_text,options,correct_answer\nmcq,Q,a|b,c'),
        /correct_answer must match an option/
    );
    assert.throws(
        () => parseGoogleFormQuestionCsv('question_type,question_text,options,correct_answer\nmcq,Q,a|A,a'),
        /duplicate answer options/
    );

    const header = 'question_type,question_text,options,correct_answer';
    const rows = Array.from({ length: 101 }, (_, index) => `mcq,Q${index},a|b,a`).join('\n');
    assert.throws(() => parseGoogleFormQuestionCsv(`${header}\n${rows}`), /no more than 100 questions/);
});
