import assert from 'node:assert/strict';
import test from 'node:test';
import {
    inferAcademicYear,
    inferSemester,
    retireLegacyPeriodPrefs,
    applySchoolPeriod,
} from './schoolPeriod.js';

test('academic year inference rolls over in August', () => {
    assert.equal(inferAcademicYear(new Date(2026, 6, 15)), '2025-2026');
    assert.equal(inferAcademicYear(new Date(2026, 7, 1)), '2026-2027');
    assert.equal(inferAcademicYear(new Date(2026, 11, 31)), '2026-2027');
    assert.equal(inferAcademicYear(new Date(2027, 0, 1)), '2026-2027');
});

test('semester inference: Aug–Dec is semester 1, Jan–Jul is semester 2', () => {
    assert.equal(inferSemester(new Date(2026, 7, 1)), 1);
    assert.equal(inferSemester(new Date(2026, 11, 31)), 1);
    assert.equal(inferSemester(new Date(2027, 0, 1)), 2);
    assert.equal(inferSemester(new Date(2027, 6, 31)), 2);
});

test('legacy personal period prefs are removed, other keys untouched', () => {
    const store = new Map([
        ['currentAcademicYear', '2024-2025'],
        ['selectedSemester', '2'],
        ['theme', 'dark'],
    ]);
    const storage = {
        removeItem: (key) => store.delete(key),
    };
    retireLegacyPeriodPrefs(storage);
    assert.equal(store.has('currentAcademicYear'), false);
    assert.equal(store.has('selectedSemester'), false);
    assert.equal(store.get('theme'), 'dark');
    retireLegacyPeriodPrefs(null);
});

test('school period sync sets working context and school reference together', () => {
    const state = {
        currentAcademicYear: '2025-2026',
        selectedSemester: 2,
        schoolCurrentYear: null,
        schoolCurrentSemester: null,
    };
    applySchoolPeriod(state, { academicYear: '2026-2027', semester: 1 });
    assert.equal(state.currentAcademicYear, '2026-2027');
    assert.equal(state.schoolCurrentYear, '2026-2027');
    assert.equal(state.selectedSemester, 1);
    assert.equal(state.schoolCurrentSemester, 1);
});

test('null period and invalid semester never clobber the working context', () => {
    const state = {
        currentAcademicYear: '2026-2027',
        selectedSemester: 1,
        schoolCurrentYear: '2026-2027',
        schoolCurrentSemester: 1,
    };
    applySchoolPeriod(state, null);
    applySchoolPeriod(state, { academicYear: '2026-2027', semester: null });
    applySchoolPeriod(state, { academicYear: '2026-2027', semester: 'full' });
    assert.equal(state.selectedSemester, 1);
    assert.equal(state.schoolCurrentSemester, 1);
    applySchoolPeriod(state, { semester: 2 });
    assert.equal(state.currentAcademicYear, '2026-2027');
    assert.equal(state.selectedSemester, 2);
});