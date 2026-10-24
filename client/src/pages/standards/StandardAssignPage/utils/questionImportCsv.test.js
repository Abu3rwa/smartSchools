import assert from 'node:assert/strict';
import test from 'node:test';
import { questionGuideRows } from '../../../../components/assessment/questionTypeGuideData.js';
import { buildTemplateCsv, parseCsv, parseQuestionImport } from './questionImportCsv.js';

const HEADER =
    'question_type,question_text,option_a,option_b,option_c,option_d,correct_answer';

const parseRows = (rows) => parseQuestionImport([HEADER, ...rows].join('\n'));

test('accepts multiple-choice options that differ only by capitalization', () => {
    const { rows } = parseRows([
        'multiple_choice,Which sentence is capitalized correctly?,the cat sleeps.,The cat sleeps.,the Cat sleeps.,The cat Sleeps.,B'
    ]);

    assert.deepEqual(rows[0].errors, []);
    assert.equal(rows[0].question.options[1].text, 'The cat sleeps.');
});

test('treats the same generic stem with different options as separate questions', () => {
    const { rows } = parseRows([
        'multiple_choice,Which sentence is correct?,She goes to school.,She go to school.,They goes to school.,They go to schools.,A',
        'multiple_choice,Which sentence is correct?,He have a pen.,He has a pen.,He has a pens.,He having a pen.,B'
    ]);

    assert.deepEqual(rows.map((row) => row.errors), [[], []]);
});

test('still flags exact duplicate questions', () => {
    const { rows } = parseRows([
        'multiple_choice,Which number is prime?,4,6,7,9,C',
        'multiple_choice,Which number is prime?,4,6,7,9,C'
    ]);

    assert.deepEqual(rows[1].errors, [{ code: 'duplicateQuestion' }]);
});

test('still compares question stems case-insensitively', () => {
    const { rows } = parseRows([
        'multiple_choice,Which number is prime?,4,6,7,9,C',
        'multiple_choice,which number is PRIME?,4,6,7,9,C'
    ]);

    assert.deepEqual(rows[1].errors, [{ code: 'duplicateQuestion' }]);
});

test('still flags options that are truly identical', () => {
    const { rows } = parseRows([
        'multiple_choice,Choose the correct spelling?,recieve,receive,recieve,receive,B'
    ]);

    assert.deepEqual(rows[0].errors, [{ code: 'duplicateOptions' }]);
});

test('the teacher guide explains every question type the shipped template uses', () => {
    const records = parseCsv(buildTemplateCsv());
    const typeIndex = records[0].indexOf('question_type');
    const templateTypes = [...new Set(records.slice(1).map((cells) => String(cells[typeIndex]).trim()))].sort();

    assert.deepEqual(questionGuideRows('standards').map((row) => row.token).sort(), templateTypes);
});
