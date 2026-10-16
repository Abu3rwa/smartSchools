import assert from 'node:assert/strict';
import test from 'node:test';

const { validateGoogleFormQuestions } = await import('../services/googleFormsAssignmentService.js');

test('normalizes supported quiz questions and trims their content', () => {
    const questions = validateGoogleFormQuestions([
        {
            type: 'multiple_choice',
            title: '  Choose a color  ',
            options: [' Red ', 'Blue', 'Blue'],
            correctAnswer: ' Red ',
            points: 2
        },
        {
            type: 'true_false',
            title: 'The sky is blue.',
            correctAnswer: 'True',
            points: 1
        },
        {
            type: 'short_answer',
            title: 'Explain your answer.',
            points: 0
        }
    ]);

    assert.deepEqual(questions, [
        {
            type: 'multiple_choice',
            title: 'Choose a color',
            options: ['Red', 'Blue'],
            correctAnswer: 'Red',
            points: 2
        },
        {
            type: 'true_false',
            title: 'The sky is blue.',
            options: ['True', 'False'],
            correctAnswer: 'True',
            points: 1
        },
        {
            type: 'short_answer',
            title: 'Explain your answer.',
            points: 0
        }
    ]);
});

test('rejects missing questions and unsupported question types', () => {
    assert.throws(() => validateGoogleFormQuestions([]), /between 1 and 100/);
    assert.throws(() => validateGoogleFormQuestions([{
        type: 'paragraph',
        title: 'Explain',
        points: 0
    }]), /supported type/);
});

test('rejects invalid objective options, answer keys, and point values', () => {
    assert.throws(() => validateGoogleFormQuestions([{
        type: 'multiple_choice',
        title: 'Choose one',
        options: ['Only one'],
        correctAnswer: 'Only one',
        points: 1
    }]), /2 to 20 answer options/);

    assert.throws(() => validateGoogleFormQuestions([{
        type: 'true_false',
        title: 'True or false',
        correctAnswer: 'Maybe',
        points: 1
    }]), /identify one of its answer options/);

    assert.throws(() => validateGoogleFormQuestions([{
        type: 'multiple_choice',
        title: 'Choose one',
        options: ['One', 'Two'],
        correctAnswer: 'One',
        points: 1.5
    }]), /at least 1 point/);
});
