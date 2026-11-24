import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildLessonPlanParams,
    LESSON_PLAN_DEFAULT_LIMIT,
    LESSON_PLAN_SEARCH_LIMIT
} from './lessonPlanParams.js';

test('lesson plan params use the default limit and no search key when the box is empty', () => {
    assert.deepEqual(buildLessonPlanParams({ classId: 'c1', subjectId: 's1', search: '   ' }), {
        class: 'c1', subject: 's1', page: 1, limit: LESSON_PLAN_DEFAULT_LIMIT
    });
});

test('lesson plan params widen the limit and trim the search term', () => {
    assert.deepEqual(buildLessonPlanParams({ classId: 'c1', subjectId: 's1', search: '  fractions  ' }), {
        class: 'c1', subject: 's1', page: 1, limit: LESSON_PLAN_SEARCH_LIMIT, search: 'fractions'
    });
});
