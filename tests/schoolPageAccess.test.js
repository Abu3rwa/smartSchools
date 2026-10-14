import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SCHOOL_PAGE_ACCESS_PAGES,
    getSchoolPageAccess,
    getSchoolPageAccessForRole,
    getSchoolPageForApiPath
} from '../config/schoolPageAccess.js';
import { SCHOOL_PAGE_ACCESS_PAGES as CLIENT_SCHOOL_PAGE_ACCESS_PAGES } from '../client/src/constants/schoolPageAccess.js';
import { getSchoolPageKeyForPath } from '../client/src/constants/schoolPageAccess.js';

test('server and client page-access registries stay aligned', () => {
    assert.deepEqual(
        CLIENT_SCHOOL_PAGE_ACCESS_PAGES.map(({ key }) => key).sort(),
        SCHOOL_PAGE_ACCESS_PAGES.map(({ key }) => key).sort()
    );
});

test('school page access defaults every managed page to available', () => {
    const access = getSchoolPageAccess({});
    assert.equal(access.teacher.liveLessons, true);
    assert.equal(access.student.liveLessons, true);
    assert.equal(access.teacher.assignments, true);
});

test('school page availability overrides remain scoped to the selected role', () => {
    const settings = {
        userPageAccess: {
            teacher: { liveLessons: false },
            student: { assignments: false }
        }
    };

    assert.equal(getSchoolPageAccessForRole(settings, 'teacher', 'liveLessons'), false);
    assert.equal(getSchoolPageAccessForRole(settings, 'student', 'liveLessons'), true);
    assert.equal(getSchoolPageAccessForRole(settings, 'student', 'assignments'), false);
    assert.equal(getSchoolPageAccessForRole(settings, 'admin', 'liveLessons'), true);
});

test('API paths map to their managed page area', () => {
    assert.equal(getSchoolPageForApiPath('/api/live/sessions/abc'), 'liveLessons');
    assert.equal(getSchoolPageForApiPath('/api/standard-assignments/abc'), 'standardsAssessments');
    assert.equal(getSchoolPageForApiPath('/api/students/abc'), 'students');
    assert.equal(getSchoolPageForApiPath('/api/students/abc/academic-excellence/tasks'), 'academicExcellence');
    assert.equal(getSchoolPageForApiPath('/api/auth/me'), null);
});

test('nested teacher pages use their own page-access group', () => {
    assert.equal(getSchoolPageKeyForPath('/portal/students/abc/spelling'), 'spelling');
    assert.equal(getSchoolPageKeyForPath('/portal/classes/abc/gradebook'), 'gradebook');
});
