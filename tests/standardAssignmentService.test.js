import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildQuestionPool,
    resolveQuestionPoolQuestions,
    sanitizeImportedQuestions
} from '../services/standardAssignmentService.js';
import standardsPracticeAIService from '../services/standardsPracticeAIService.js';

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
