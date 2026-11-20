import assert from 'node:assert/strict';
import test from 'node:test';

import {
    dateKeyFor,
    earnedBadges,
    gradeGameItem,
    levelForXp,
    mergeBadges,
    normalizeGameAnswer,
    previousWeekKey,
    registerPracticeDay,
    selectSessionItems,
    weekKeyForDateKey,
    xpForAttempt,
    xpForCompletedSession
} from '../services/languageGameScoring.js';

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

test('answers compare case-insensitively with collapsed whitespace', () => {
    assert.equal(normalizeGameAnswer('  Un   HAPPY  '), 'un happy');
    assert.equal(normalizeGameAnswer('un\u00A0happy'), 'un happy');
});

test('Arabic diacritics and tatweel are stripped but letter forms stay distinct', () => {
    assert.equal(normalizeGameAnswer('كَتَبَ'), normalizeGameAnswer('كتب'));
    assert.equal(normalizeGameAnswer('مـدرسـة'), normalizeGameAnswer('مدرسة'));
    assert.notEqual(normalizeGameAnswer('أحمد'), normalizeGameAnswer('احمد'), 'hamza is a letter, not a mark');
});

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

test('mcq grades by stable option id', () => {
    const item = { type: 'mcq', correctOptionId: '2', options: [{ id: '1', text: 'a' }, { id: '2', text: 'b' }] };
    assert.equal(gradeGameItem(item, '2').correct, true);
    assert.equal(gradeGameItem(item, ' 2 ').correct, true);
    assert.equal(gradeGameItem(item, '1').correct, false);
    assert.equal(gradeGameItem(item, '').correct, false);
});

test('fill_blank accepts any listed alternative and rejects blank input', () => {
    const item = { type: 'fill_blank', acceptedAnswers: ['unhappy', 'un happy'] };
    assert.equal(gradeGameItem(item, 'UNHAPPY').correct, true);
    assert.equal(gradeGameItem(item, ' Un  Happy ').correct, true);
    assert.equal(gradeGameItem(item, 'happy').correct, false);
    assert.equal(gradeGameItem(item, '   ').correct, false);
});

test('grading reports the first accepted answer for the reveal', () => {
    const item = { type: 'fill_blank', acceptedAnswers: ['unhappy', 'un happy'] };
    assert.equal(gradeGameItem(item, 'wrong').expected, 'unhappy');
});

test('true_false accepts canonical values and common aliases, rejects anything else', () => {
    const item = { type: 'true_false', correctAnswer: 'true' };
    assert.equal(gradeGameItem(item, 'true').correct, true);
    assert.equal(gradeGameItem(item, 'YES').correct, true);
    assert.equal(gradeGameItem(item, 'صح').correct, true);
    assert.equal(gradeGameItem(item, 'false').correct, false);
    assert.equal(gradeGameItem(item, '').correct, false);
    assert.equal(gradeGameItem(item, 'maybe').correct, false);
    const falseItem = { type: 'true_false', correctAnswer: 'false' };
    assert.equal(gradeGameItem(falseItem, 'no').correct, true);
    assert.equal(gradeGameItem(falseItem, 'لا').correct, true);
});

test('multiple_select needs the exact correct set; partial or empty is incorrect', () => {
    const item = {
        type: 'multiple_select',
        correctAnswer: '1|3',
        options: [{ id: '1', text: '2' }, { id: '2', text: '4' }, { id: '3', text: '7' }]
    };
    assert.equal(gradeGameItem(item, '1|3').correct, true);
    assert.equal(gradeGameItem(item, '3|1').correct, true);
    assert.equal(gradeGameItem(item, ['1', '3']).correct, true);
    assert.equal(gradeGameItem(item, '1').correct, false);
    assert.equal(gradeGameItem(item, '1|2|3').correct, false);
    assert.equal(gradeGameItem(item, '').correct, false);
});

test('matching grades every pair; a partial match is incorrect, never sent to review', () => {
    const item = {
        type: 'matching',
        matchingPairs: [{ left: 'Mercury', right: '1' }, { left: 'Venus', right: '2' }, { left: 'Earth', right: '3' }],
        correctAnswer: 'Mercury::1|Venus::2|Earth::3'
    };
    assert.equal(gradeGameItem(item, 'Mercury::1|Venus::2|Earth::3').correct, true);
    assert.equal(gradeGameItem(item, [
        { left: 'Earth', right: '3' }, { left: 'Mercury', right: '1' }, { left: 'Venus', right: '2' }
    ]).correct, true);
    assert.equal(gradeGameItem(item, 'Mercury::1|Venus::2').correct, false);
    assert.equal(gradeGameItem(item, 'Mercury::2|Venus::1|Earth::3').correct, false);
    assert.equal(gradeGameItem(item, '').correct, false);
});

test('ordering needs the full authored sequence; wrong or incomplete order is incorrect', () => {
    const item = {
        type: 'ordering',
        orderingItems: [{ id: 'i1', text: 'Sunrise' }, { id: 'i2', text: 'Noon' }, { id: 'i3', text: 'Sunset' }],
        correctAnswer: 'i1>i2>i3'
    };
    assert.equal(gradeGameItem(item, 'i1>i2>i3').correct, true);
    assert.equal(gradeGameItem(item, ['i1', 'i2', 'i3']).correct, true);
    assert.equal(gradeGameItem(item, 'i3>i2>i1').correct, false);
    assert.equal(gradeGameItem(item, 'i1>i2').correct, false);
    assert.equal(gradeGameItem(item, '').correct, false);
});

test('numeric_response grades exact, tolerance and range rules deterministically', () => {
    const exact = { type: 'numeric_response', numericRule: { mode: 'exact', value: '144' }, correctAnswer: '144' };
    assert.equal(gradeGameItem(exact, '144').correct, true);
    assert.equal(gradeGameItem(exact, '145').correct, false);
    const tolerance = { type: 'numeric_response', numericRule: { mode: 'tolerance', value: '3.14', tolerance: '0.01' }, correctAnswer: '3.14 ±0.01' };
    assert.equal(gradeGameItem(tolerance, '3.141').correct, true);
    assert.equal(gradeGameItem(tolerance, '3.2').correct, false);
    const range = { type: 'numeric_response', numericRule: { mode: 'range', min: '10', max: '20' }, correctAnswer: '10-20' };
    assert.equal(gradeGameItem(range, '15').correct, true);
    assert.equal(gradeGameItem(range, '21').correct, false);
    assert.equal(gradeGameItem(exact, '').correct, false);
});

test('legacy stored type names still grade through the shared resolver', () => {
    assert.equal(gradeGameItem({ type: 'mcq', correctOptionId: '1' }, '1').correct, true);
    assert.equal(gradeGameItem({ type: 'fill_blank', acceptedAnswers: ['كتب'] }, 'كَتَبَ').correct, true);
});

/* ------------------------------------------------------------------ */
/* Session item selection                                              */
/* ------------------------------------------------------------------ */

test('selectSessionItems caps at the requested count without mutating the source', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({ externalId: `i${index}` }));
    const picked = selectSessionItems(items, { itemCount: 3, shuffle: false });
    assert.deepEqual(picked.map((item) => item.externalId), ['i0', 'i1', 'i2']);
    assert.equal(items.length, 8);
});

test('selectSessionItems shuffles deterministically with an injected rng', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => ({ externalId: id }));
    const rng = () => 0;
    const picked = selectSessionItems(items, { itemCount: 4, shuffle: true, rng });
    assert.equal(picked.length, 4);
    assert.deepEqual(new Set(picked.map((item) => item.externalId)), new Set(['a', 'b', 'c', 'd']));
    const again = selectSessionItems(items, { itemCount: 4, shuffle: true, rng });
    assert.deepEqual(picked.map((item) => item.externalId), again.map((item) => item.externalId));
});

/* ------------------------------------------------------------------ */
/* XP and levels                                                       */
/* ------------------------------------------------------------------ */

test('XP rewards correct answers without speed bonuses', () => {
    assert.equal(xpForAttempt({ correct: true, firstAttempt: true }), 10);
    assert.equal(xpForAttempt({ correct: true, firstAttempt: false }), 5);
    assert.equal(xpForAttempt({ correct: false, firstAttempt: true }), 2);
    assert.equal(xpForCompletedSession([
        { correct: true, firstAttempt: true },
        { correct: false, firstAttempt: true },
        { correct: true, firstAttempt: true }
    ]), 22);
});

test('level thresholds grow by 25 XP each level', () => {
    assert.deepEqual(levelForXp(0), { level: 1, intoLevel: 0, nextLevelAt: 100 });
    assert.deepEqual(levelForXp(99), { level: 1, intoLevel: 99, nextLevelAt: 100 });
    assert.deepEqual(levelForXp(100), { level: 2, intoLevel: 0, nextLevelAt: 125 });
    assert.deepEqual(levelForXp(225), { level: 3, intoLevel: 0, nextLevelAt: 150 });
    assert.equal(levelForXp(2125).level, 11);
});

/* ------------------------------------------------------------------ */
/* Dates and weeks                                                     */
/* ------------------------------------------------------------------ */

test('dateKeyFor reads the calendar date in the school timezone', () => {
    const instant = new Date('2026-11-19T22:30:00Z');
    assert.equal(dateKeyFor(instant, 'Asia/Riyadh'), '2026-11-20');
    assert.equal(dateKeyFor(instant, 'UTC'), '2026-11-19');
    assert.equal(dateKeyFor(instant, 'Not/AZone'), '2026-11-19');
});

test('week keys follow ISO weeks, including the year boundary', () => {
    assert.equal(weekKeyForDateKey('2026-11-19'), '2026-W47');
    assert.equal(weekKeyForDateKey('2026-01-01'), '2026-W01');
    assert.equal(previousWeekKey('2026-W01'), '2025-W52');
    assert.equal(previousWeekKey('2026-W47'), '2026-W46');
});

/* ------------------------------------------------------------------ */
/* Weekly goal and streak                                              */
/* ------------------------------------------------------------------ */

test('a week qualifies only after the goal number of distinct days', () => {
    const first = registerPracticeDay({ practiceDays: [] }, '2026-11-16');
    assert.equal(first.daysThisWeek, 1);
    assert.equal(first.qualifiedThisWeek, false);
    const second = registerPracticeDay(first, '2026-11-17');
    assert.equal(second.qualifiedThisWeek, false);
    const third = registerPracticeDay(second, '2026-11-19');
    assert.equal(third.qualifiedThisWeek, true);
    assert.equal(third.streakWeeks, 1);
    assert.equal(third.lastQualifiedWeek, '2026-W47');
});

test('the same day never counts twice and a qualified week is not incrementing repeatedly', () => {
    const first = registerPracticeDay({ practiceDays: [] }, '2026-11-16');
    const again = registerPracticeDay(first, '2026-11-16');
    assert.equal(again.daysThisWeek, 1);
    const qualified = ['2026-11-17', '2026-11-18'].reduce(
        (state, day) => registerPracticeDay(state, day),
        again
    );
    assert.equal(qualified.streakWeeks, 1);
    const extraDay = registerPracticeDay(qualified, '2026-11-19');
    assert.equal(extraDay.qualifiedThisWeek, false);
    assert.equal(extraDay.streakWeeks, 1);
});

test('consecutive qualified weeks extend the streak, a missed week resets it', () => {
    const week46 = ['2026-11-09', '2026-11-10', '2026-11-11'].reduce(
        (state, day) => registerPracticeDay(state, day),
        { practiceDays: [] }
    );
    assert.equal(week46.streakWeeks, 1);
    const week47 = ['2026-11-16', '2026-11-17', '2026-11-18'].reduce(
        (state, day) => registerPracticeDay(state, day),
        week46
    );
    assert.equal(week47.streakWeeks, 2);
    assert.equal(week47.longestStreakWeeks, 2);
    // Week 48 is skipped; qualifying in week 49 restarts at one.
    const week49 = ['2026-11-30', '2026-12-01', '2026-12-02'].reduce(
        (state, day) => registerPracticeDay(state, day),
        week47
    );
    assert.equal(week49.streakWeeks, 1);
    assert.equal(week49.longestStreakWeeks, 2);
});

test('practice days are bounded and sorted', () => {
    let state = { practiceDays: [] };
    for (let day = 1; day <= 200; day += 1) {
        const date = new Date(Date.UTC(2026, 0, day));
        state = registerPracticeDay(state, date.toISOString().slice(0, 10));
    }
    assert.equal(state.practiceDays.length, 140);
    const sorted = [...state.practiceDays].sort();
    assert.deepEqual(state.practiceDays, sorted);
});

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

test('badges are added, never removed or duplicated', () => {
    assert.deepEqual(earnedBadges({ xp: 0, streakWeeks: 0, totalAttempts: 1 }), ['first_practice']);
    assert.deepEqual(earnedBadges({ xp: 550, streakWeeks: 4, totalAttempts: 100 }), ['first_practice', 'level_5', 'streak_4', 'hundred_answers']);
    assert.deepEqual(mergeBadges(['first_practice', 'level_5'], ['level_5', 'streak_4']), ['first_practice', 'level_5', 'streak_4']);
});
