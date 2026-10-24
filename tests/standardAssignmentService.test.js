import assert from 'node:assert/strict';
import test from 'node:test';
import {
    attachImportedPassages,
    buildQuestionPool,
    resolveQuestionPoolQuestions,
    sanitizeImportedQuestions
} from '../services/standardAssignmentService.js';
import standardsPracticeAIService from '../services/standardsPracticeAIService.js';
import AssessmentPassage from '../models/AssessmentPassage.js';

test('imported questions bypass the question generator entirely', async () => {
    const importedQuestions = [{
        questionText: 'A triangle has three sides.',
        questionType: 'true_false',
        options: [{ label: 'A', text: 'True' }, { label: 'B', text: 'False' }],
        correctAnswer: 'True'
    }];
    let generationCalls = 0;

    const pool = await resolveQuestionPoolQuestions({
        importedQuestions,
        generate: async () => {
            generationCalls += 1;
            throw new Error('The generator must not run for imported questions');
        }
    });

    assert.equal(generationCalls, 0);
    assert.deepEqual(pool.questions, importedQuestions);
    assert.deepEqual(pool.failures, []);
});

test('imported questions win over the grammar bank when grammar leveling is enabled', async () => {
    const importedQuestions = [{
        questionText: 'Choose the correct past tense: She ___ home.',
        questionType: 'multiple_choice',
        options: [{ label: 'A', text: 'walked' }, { label: 'B', text: 'walks' }],
        correctAnswer: 'A'
    }];

    const pool = await resolveQuestionPoolQuestions({
        importedQuestions,
        generate: () => buildQuestionPool({
            standard: { _id: 'std-grammar', code: 'GR.1.1', name: 'Past tense' },
            subjectName: 'English Grammar',
            questionCount: 3,
            practiceConfig: {
                enableGrammarLeveling: true,
                grammarLevels: ['beginner'],
                allowedQuestionTypes: ['multiple_choice', 'true_false']
            }
        })
    });

    assert.equal(pool.questions.length, 1);
    assert.equal(pool.questions[0].questionText, importedQuestions[0].questionText);
});

test('generated question pools still invoke the generator when no questions were imported', async () => {
    let generationCalls = 0;
    const generatedQuestions = [{ questionText: 'Generated question' }];

    const pool = await resolveQuestionPoolQuestions({
        importedQuestions: [],
        generate: async () => {
            generationCalls += 1;
            return { questions: generatedQuestions, failures: [] };
        }
    });

    assert.equal(generationCalls, 1);
    assert.deepEqual(pool.questions, generatedQuestions);
    assert.deepEqual(pool.failures, []);
});

test('import sanitizer accepts valid imported true-false and multiple-choice questions', () => {
    const result = sanitizeImportedQuestions([
        {
            questionText: 'The sun is a star.',
            questionType: 'true_false',
            correctAnswer: 'true'
        },
        {
            questionText: 'Which is a prime number?',
            questionType: 'multiple_choice',
            options: [
                { text: '4' },
                { text: '6' },
                { text: '7' },
                { text: '9' }
            ],
            correctAnswer: 'C'
        }
    ]);

    assert.equal(result.error, null);
    assert.equal(result.questions.length, 2);
    assert.equal(result.questions[0].correctAnswer, 'True');
    assert.equal(result.questions[1].correctAnswer, 'C');
});

test('imported objective questions store an authored definition the grader can read', () => {
    const result = sanitizeImportedQuestions([
        {
            questionText: 'Select every prime number.',
            questionType: 'multiple_select',
            options: [{ text: '2' }, { text: '4' }, { text: '5' }, { text: '9' }],
            correctAnswer: ['A', 'C']
        },
        {
            questionText: 'Match each capital to its country.',
            questionType: 'matching',
            matchingPairs: [
                { left: 'France', right: 'Paris' },
                { left: 'Kenya', right: 'Nairobi' }
            ]
        },
        {
            questionText: 'Put the plant life cycle in order.',
            questionType: 'ordering',
            orderingItems: ['Seed', 'Sprout', 'Flower']
        },
        {
            questionText: 'The {{b1}} sat on the {{b2}}.',
            questionType: 'fill_in_blank',
            blanks: [{ id: 'b1', accepts: ['cat'] }, { id: 'b2', accepts: ['mat', 'rug'] }]
        },
        {
            questionText: 'Round 2.345 to two decimals.',
            questionType: 'numeric_response',
            numericRule: { mode: 'tolerance', value: '2.35', tolerance: '0.01' }
        }
    ]);

    assert.equal(result.error, null);
    const [select, matching, ordering, blanks, numeric] = result.questions;

    assert.equal(select.gradingMode, 'exact_match');
    assert.equal(select.correctAnswer, 'A|C');
    assert.deepEqual(select.options.map((option) => option.label), ['A', 'B', 'C', 'D']);

    assert.equal(matching.matchingPairs.length, 2);
    assert.equal(matching.correctAnswer, 'France::Paris|Kenya::Nairobi');

    assert.equal(ordering.orderingItems.length, 3);
    assert.deepEqual(
        ordering.correctAnswer.split('>').map((id) => ordering.orderingItems.find((item) => item.id === id).text),
        ['Seed', 'Sprout', 'Flower']
    );

    assert.deepEqual(blanks.blanks.map((blank) => blank.id), ['b1', 'b2']);
    assert.equal(blanks.correctAnswer, 'b1::cat|b2::mat~rug');

    assert.deepEqual(numeric.numericRule, { mode: 'tolerance', value: '2.35', tolerance: '0.01' });
    assert.equal(numeric.correctAnswer, '2.35 ±0.01');
});

test('imported objective questions are rejected with the reason the row cannot be graded', () => {
    const cases = [
        [{ questionText: 'Select two.', questionType: 'multiple_select', options: [{ text: 'one' }, { text: 'two' }], correctAnswer: ['A', 'Z'] }],
        [{ questionText: 'Order it.', questionType: 'ordering', orderingItems: ['one', 'two'] }],
        [{ questionText: 'No token here.', questionType: 'fill_in_blank', blanks: [{ id: 'b1', accepts: ['cat'] }] }],
        [{ questionText: 'A number?', questionType: 'numeric_response', numericRule: { mode: 'exact', value: 'not-a-number' } }],
        [{ questionText: 'Match it.', questionType: 'matching', matchingPairs: [{ left: 'only', right: 'one' }] }]
    ];

    cases.forEach((input) => {
        const result = sanitizeImportedQuestions(input);
        assert.deepEqual(result.questions, []);
        assert.match(result.error, /Imported question 1:/);
    });
});

test('an imported passage travels with the question that cites it', () => {
    const result = sanitizeImportedQuestions([
        {
            questionText: 'According to the passage, why did the lighthouse keeper stay?',
            questionType: 'multiple_choice',
            options: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }],
            correctAnswer: 'B',
            passageId: 'lh-1',
            passageTitle: 'The Last Light',
            passageText: 'The keeper stayed through the storm.'
        },
        {
            questionText: 'A square has four sides.',
            questionType: 'true_false',
            correctAnswer: 'true'
        }
    ]);

    assert.equal(result.error, null);
    assert.deepEqual(
        { id: result.questions[0].passageId, title: result.questions[0].passageTitle, text: result.questions[0].passageText },
        { id: 'lh-1', title: 'The Last Light', text: 'The keeper stayed through the storm.' }
    );
    assert.equal(Object.hasOwn(result.questions[1], 'passageId'), false);
});

test('a passage cited by id only is found in the batch or in an earlier import', async () => {
    const originalFindOne = AssessmentPassage.findOne;
    const originalCreate = AssessmentPassage.create;
    const storedPassages = new Map();

    try {
        AssessmentPassage.findOne = (filter) => ({ lean: async () => storedPassages.get(String(filter?.passageKey)) || null });
        AssessmentPassage.create = async (doc) => {
            const record = { _id: `passage-${String(doc.passageKey)}`, ...doc };
            storedPassages.set(String(doc.passageKey), record);
            return record;
        };

        const carrying = await attachImportedPassages({
            schoolId: 'school-1',
            assignmentId: 'assignment-1',
            questions: [{
                questionText: 'Why did the keeper stay?',
                passageId: 'lh-1',
                passageTitle: 'The Last Light',
                passageText: 'The keeper stayed through the storm.'
            }]
        });
        assert.deepEqual(carrying.warnings, []);
        assert.equal(carrying.questions[0].passage, 'passage-lh-1');

        const inSameBatch = await attachImportedPassages({
            schoolId: 'school-1',
            assignmentId: 'assignment-1',
            questions: [
                { questionText: 'What did the lamp burn?' },
                { questionText: 'What did the lamp burn?', passageId: 'lh-1' },
                { questionText: 'A square has four sides.' }
            ]
        });
        assert.equal(inSameBatch.questions[1].passage, 'passage-lh-1');
        assert.equal(inSameBatch.questions[1].passageTitle, 'The Last Light');
        assert.equal(inSameBatch.questions[1].passageText, 'The keeper stayed through the storm.');
        assert.equal(Object.hasOwn(inSameBatch.questions[0], 'passage'), false);

        const fromEarlierImport = await attachImportedPassages({
            schoolId: 'school-1',
            assignmentId: 'assignment-1',
            questions: [
                { questionText: 'Second read of the same passage.', passageId: 'lh-2' },
                { questionText: 'Carries it after the citation.', passageId: 'lh-2', passageTitle: 'Storm', passageText: 'Wind hit the glass.' }
            ]
        });
        assert.deepEqual(fromEarlierImport.warnings, []);
        assert.equal(fromEarlierImport.questions[0].passage, 'passage-lh-2');
        assert.equal(fromEarlierImport.questions[0].passageText, 'Wind hit the glass.');
        assert.equal(fromEarlierImport.questions[1].passage, 'passage-lh-2');

        const unknownId = await attachImportedPassages({
            schoolId: 'school-1',
            assignmentId: 'assignment-1',
            questions: [{ questionText: 'Dangling citation.', passageId: 'ghost' }]
        });
        assert.equal(Object.hasOwn(unknownId.questions[0], 'passage'), false);
        assert.deepEqual(unknownId.warnings, ['Passage "ghost" is cited without text and no stored passage has that id.']);
    } finally {
        AssessmentPassage.findOne = originalFindOne;
        AssessmentPassage.create = originalCreate;
    }
});

test('pool generation leaves a slot empty instead of storing a filler question', async (t) => {
    t.mock.method(standardsPracticeAIService, 'generateQuestion', async ({ attemptNumber }) => {
        if (attemptNumber === 2) throw new Error('AI returned an unusable question');
        return {
            questionText: `Real question ${attemptNumber}`,
            questionType: 'multiple_choice',
            options: [{ label: 'A', text: 'one' }, { label: 'B', text: 'two' }],
            correctAnswer: 'A',
            difficulty: 'medium'
        };
    });

    const pool = await buildQuestionPool({
        standard: { _id: 'std-1', code: 'CC.1.1', name: 'Civic participation' },
        subjectName: 'Social Studies',
        questionCount: 3,
        practiceConfig: {}
    });

    assert.equal(pool.questions.length, 2);
    assert.deepEqual(pool.failures, [{
        slot: 2,
        questionType: 'true_false',
        difficulty: 'medium',
        reason: 'AI returned an unusable question'
    }]);
    assert.equal(
        pool.questions.some((question) => /best describes|focus standards/i.test(question.questionText)),
        false
    );
});
