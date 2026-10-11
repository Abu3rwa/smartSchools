import assert from 'node:assert/strict';
import test from 'node:test';
import {
    resolveQuestionPoolQuestions,
    sanitizeImportedQuestions
} from '../services/standardAssignmentService.js';

test('imported questions bypass the question generator entirely', async () => {
    const importedQuestions = [{
        questionText: 'A triangle has three sides.',
        questionType: 'true_false',
        options: [{ label: 'A', text: 'True' }, { label: 'B', text: 'False' }],
        correctAnswer: 'True'
    }];
    let generationCalls = 0;

    const questions = await resolveQuestionPoolQuestions({
        importedQuestions,
        generate: async () => {
            generationCalls += 1;
            throw new Error('The generator must not run for imported questions');
        }
    });

    assert.equal(generationCalls, 0);
    assert.deepEqual(questions, importedQuestions);
});

test('generated question pools still invoke the generator when no questions were imported', async () => {
    let generationCalls = 0;
    const generatedQuestions = [{ questionText: 'Generated question' }];

    const questions = await resolveQuestionPoolQuestions({
        importedQuestions: [],
        generate: async () => {
            generationCalls += 1;
            return generatedQuestions;
        }
    });

    assert.equal(generationCalls, 1);
    assert.deepEqual(questions, generatedQuestions);
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
