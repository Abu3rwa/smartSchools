import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACTIVE_SEMESTERS,
    inferActiveSemester,
    normalizeActiveSemester,
    resolveSchoolActiveSemester,
    resolveSchoolActivePeriod,
    validateAcademicPeriodPayload
} from '../utils/academicPeriod.js';

test('inferActiveSemester follows the Aug–Dec / Jan–Jul school split', () => {
    assert.equal(inferActiveSemester(new Date(2026, 7, 15)), 1);
    assert.equal(inferActiveSemester(new Date(2026, 11, 1)), 1);
    assert.equal(inferActiveSemester(new Date(2026, 0, 10)), 2);
    assert.equal(inferActiveSemester(new Date(2026, 6, 31)), 2);
});

test('normalizeActiveSemester accepts only 1 and 2', () => {
    assert.equal(normalizeActiveSemester(1), 1);
    assert.equal(normalizeActiveSemester('2'), 2);
    assert.equal(normalizeActiveSemester(0), null);
    assert.equal(normalizeActiveSemester(3), null);
    assert.equal(normalizeActiveSemester(null), null);
    assert.equal(normalizeActiveSemester(undefined), null);
    assert.equal(normalizeActiveSemester(''), null);
    assert.equal(normalizeActiveSemester('full'), null);
    assert.deepEqual(ACTIVE_SEMESTERS, [1, 2]);
});

test('resolveSchoolActiveSemester prefers the configured school value', () => {
    const school = { settings: { currentSemester: 2 } };
    assert.equal(resolveSchoolActiveSemester(school, new Date(2026, 8, 1)), 2);
});

test('resolveSchoolActiveSemester infers when unset or invalid', () => {
    assert.equal(resolveSchoolActiveSemester({}, new Date(2026, 8, 1)), 1);
    assert.equal(resolveSchoolActiveSemester({ settings: { currentSemester: 5 } }, new Date(2026, 8, 1)), 1);
    assert.equal(resolveSchoolActiveSemester(null, new Date(2026, 1, 1)), 2);
});

test('resolveSchoolActivePeriod combines configured year and semester', () => {
    const school = { settings: { currentAcademicYear: '2026-2027', currentSemester: 1 } };
    assert.deepEqual(resolveSchoolActivePeriod(school), { academicYear: '2026-2027', semester: 1 });
});

test('validateAcademicPeriodPayload accepts a full valid period', () => {
    const result = validateAcademicPeriodPayload({ academicYear: '2026-2027', semester: 2 });
    assert.equal(result.valid, true);
    assert.deepEqual(result.data, { academicYear: '2026-2027', semester: 2 });
});

test('validateAcademicPeriodPayload accepts partial updates', () => {
    assert.deepEqual(validateAcademicPeriodPayload({ semester: 1 }).data, { semester: 1 });
    assert.deepEqual(validateAcademicPeriodPayload({ academicYear: '2025-2026' }).data, { academicYear: '2025-2026' });
});

test('validateAcademicPeriodPayload rejects invalid years', () => {
    assert.equal(validateAcademicPeriodPayload({ academicYear: '2026-2028' }).valid, false);
    assert.equal(validateAcademicPeriodPayload({ academicYear: '2026' }).valid, false);
    assert.equal(validateAcademicPeriodPayload({ academicYear: '' }).valid, false);
});

test('validateAcademicPeriodPayload rejects Full Year as an active semester', () => {
    assert.equal(validateAcademicPeriodPayload({ semester: null }).valid, false);
    assert.equal(validateAcademicPeriodPayload({ semester: 0 }).valid, false);
    assert.equal(validateAcademicPeriodPayload({ semester: 3 }).valid, false);
});

test('validateAcademicPeriodPayload rejects an empty payload', () => {
    assert.equal(validateAcademicPeriodPayload({}).valid, false);
    assert.equal(validateAcademicPeriodPayload(undefined).valid, false);
});