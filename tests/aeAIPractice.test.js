import test from 'node:test';
import assert from 'node:assert/strict';

import { validateAIPracticePayload } from '../controllers/academicExcellenceTeacherController.js';
import { sanitizeObjectiveText, isObjectiveTextDegenerate } from '../utils/sanitizeObjectiveText.js';

const validPayload = () => ({
    objectiveKey: 'MATH.7.EE.B.4',
    objectiveName: 'Solve linear equations',
    classId: '67f0f7f4f4f4f4f4f4f4f4f4',
    subjectId: '67f0f7f4f4f4f4f4f4f4f4f5',
    questionCount: 10,
    questionTypes: ['multiple_choice'],
    difficulties: ['easy', 'medium', 'hard'],
    sessionType: 'practice',
    students: [],
});

test('validateAIPracticePayload accepts valid payload', () => {
    assert.doesNotThrow(() => validateAIPracticePayload(validPayload()));
});

test('validateAIPracticePayload rejects questionCount below range', () => {
    assert.throws(() => validateAIPracticePayload({ ...validPayload(), questionCount: 0 }), (error) => {
        assert.equal(error.code, 'INVALID_QUESTION_COUNT');
        assert.equal(error.statusCode, 400);
        return true;
    });
});

test('validateAIPracticePayload rejects questionCount above range', () => {
    assert.throws(() => validateAIPracticePayload({ ...validPayload(), questionCount: 51 }), (error) => {
        assert.equal(error.code, 'INVALID_QUESTION_COUNT');
        assert.equal(error.statusCode, 400);
        return true;
    });
});

test('validateAIPracticePayload rejects empty questionTypes', () => {
    assert.throws(() => validateAIPracticePayload({ ...validPayload(), questionTypes: [] }), (error) => {
        assert.equal(error.code, 'INVALID_QUESTION_TYPES');
        assert.equal(error.statusCode, 400);
        return true;
    });
});

test('noise-only objective text becomes degenerate after sanitization', () => {
    const cleaned = sanitizeObjectiveText('At Risk\nScore: 30%\nDeveloping');
    assert.equal(cleaned, '');
    assert.equal(isObjectiveTextDegenerate(cleaned), true);
});
