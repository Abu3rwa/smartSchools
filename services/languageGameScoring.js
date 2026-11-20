// Pure rules for SkillPath practice: answer normalization, item grading,
// session item selection, XP, levels, and the weekly practice streak.
// The server owns all of it; the client only sends a response.
import { resolvePracticeQuestionType } from '../constants/practiceQuestionTypes.js';
import { gradeObjectiveAnswer } from './assessment/objectiveGrading.js';

// Arabic marks that change pronunciation but not the letter being practised.
// Stripping them must not erase letter distinctions (hamza forms are letters
// and stay untouched).
const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
const ARABIC_TATWEEL = /\u0640/g;

export const ANSWER_POLICY = Object.freeze({
    unicode: 'NFKC',
    whitespace: 'collapse',
    case: 'insensitive',
    arabicMarks: 'stripped'
});

export const normalizeGameAnswer = (value) => String(value ?? '')
    .normalize('NFKC')
    .replace(ARABIC_MARKS, '')
    .replace(ARABIC_TATWEEL, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const TRUE_TOKENS = ['true', 't', 'yes', 'y', '1', 'صح', 'نعم'];
const FALSE_TOKENS = ['false', 'f', 'no', 'n', '0', 'خطأ', 'لا'];

export const normalizeTrueFalse = (value) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (TRUE_TOKENS.includes(normalized)) return 'true';
    if (FALSE_TOKENS.includes(normalized)) return 'false';
    return null;
};

// Returns { correct, expected } where expected is only what the client may
// reveal: the correct option id, or the first accepted answer. Objective
// types reuse the shared deterministic graders; a response the grader would
// send to teacher review is simply incorrect here — SkillPath never queues
// answers for review and never calls an AI to grade.
export const gradeGameItem = (item, response) => {
    if (!item) return { correct: false, expected: '' };
    const type = resolvePracticeQuestionType(item.type);
    if (type === 'multiple_choice') {
        const correct = String(response ?? '').trim() !== ''
            && String(response).trim() === String(item.correctOptionId || '').trim();
        return { correct, expected: item.correctOptionId || '' };
    }
    if (type === 'true_false') {
        const student = normalizeTrueFalse(response);
        const expected = normalizeTrueFalse(item.correctAnswer);
        return {
            correct: Boolean(student && expected && student === expected),
            expected: item.correctAnswer || ''
        };
    }
    if (type === 'multiple_select' || type === 'matching' || type === 'ordering' || type === 'numeric_response') {
        const grade = gradeObjectiveAnswer({
            questionType: type,
            studentAnswer: response,
            correctAnswer: item.correctAnswer,
            matchingPairs: item.matchingPairs,
            orderingItems: item.orderingItems,
            numericRule: item.numericRule
        });
        return {
            correct: Boolean(grade && grade.isCorrect === true && !grade.requiresTeacherReview),
            expected: ''
        };
    }
    const accepted = (item.acceptedAnswers || [])
        .map((answer) => normalizeGameAnswer(answer))
        .filter(Boolean);
    const normalized = normalizeGameAnswer(response);
    return {
        correct: normalized !== '' && accepted.includes(normalized),
        expected: item.acceptedAnswers?.[0] || ''
    };
};

// Fisher-Yates over a copy. rng is injectable so tests are deterministic.
export const shuffleGameItems = (items, rng = Math.random) => {
    const copy = [...(items || [])];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(rng() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
};

export const selectSessionItems = (items, { itemCount = 10, shuffle = true, rng = Math.random } = {}) => {
    const source = Array.isArray(items) ? items : [];
    const ordered = shuffle ? shuffleGameItems(source, rng) : [...source];
    const limit = Math.max(1, Math.min(Number(itemCount) || source.length || 1, source.length || 1));
    return ordered.slice(0, limit);
};

// XP recognises honest practice, never speed. One award per completed
// session (unique key) keeps retries from multiplying it.
export const XP_RULES = Object.freeze({
    correctFirstAttempt: 10,
    correctLaterAttempt: 5,
    honestMiss: 2
});

export const xpForAttempt = ({ correct, firstAttempt }) => {
    if (correct) return firstAttempt ? XP_RULES.correctFirstAttempt : XP_RULES.correctLaterAttempt;
    return XP_RULES.honestMiss;
};

export const xpForCompletedSession = (attempts) => (attempts || [])
    .reduce((total, attempt) => total + xpForAttempt(attempt), 0);

// One student, one subject, one school-local day. The cap covers every XP
// source for that subject, including honest-miss XP.
export const XP_DAILY_SUBJECT_CAP = 200;

export const awardedXpForDay = (earned, usedToday) => Math.max(0, Math.min(
    Math.max(0, Number(earned) || 0),
    XP_DAILY_SUBJECT_CAP - Math.max(0, Number(usedToday) || 0)
));

// Level 1 starts at 0 XP. Each following level costs 25 more than the last.
export const levelForXp = (xp) => {
    let remaining = Math.max(0, Math.floor(Number(xp) || 0));
    let level = 1;
    let cost = 100;
    while (remaining >= cost) {
        remaining -= cost;
        level += 1;
        cost = 100 + 25 * (level - 1);
    }
    return { level, intoLevel: remaining, nextLevelAt: cost };
};

const safeTimeZone = (timeZone) => {
    if (!timeZone) return 'UTC';
    try {
        new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
        return timeZone;
    } catch {
        return 'UTC';
    }
};

// 'YYYY-MM-DD' in the school's timezone.
export const dateKeyFor = (date = new Date(), timeZone = 'UTC') => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: safeTimeZone(timeZone),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const value = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
};

// ISO week key 'YYYY-Www' from a date key, computed at noon UTC so the
// conversion never crosses a day boundary.
export const weekKeyForDateKey = (dateKey) => {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    const date = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
        ? new Date(Date.UTC(year, month - 1, day, 12))
        : new Date();
    const target = new Date(date.getTime());
    const dayNumber = (target.getUTCDay() + 6) % 7; // Monday = 0
    target.setUTCDate(target.getUTCDate() - dayNumber + 3); // Thursday of this week
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4, 12));
    const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
    const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 60 * 60 * 1000));
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

export const previousWeekKey = (weekKey) => {
    const match = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ''));
    if (!match) return '';
    const year = Number(match[1]);
    const week = Number(match[2]);
    if (week > 1) return `${year}-W${String(week - 1).padStart(2, '0')}`;
    // Step to the last ISO week of the previous year.
    const lastDay = new Date(Date.UTC(year - 1, 11, 28, 12));
    return weekKeyForDateKey(lastDay.toISOString().slice(0, 10));
};

// Calendar month key 'YYYY-MM' from a date key.
export const monthKeyForDateKey = (dateKey) => String(dateKey || '').slice(0, 7);

export const previousMonthKey = (monthKey) => {
    const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return '';
    return month === 1
        ? `${year - 1}-12`
        : `${year}-${String(month - 1).padStart(2, '0')}`;
};

const PRACTICE_DAYS_KEPT = 140;

// Records one qualifying practice day and settles the week's streak when the
// weekly goal is reached. A missed week breaks the streak; nothing is taken
// away from practiceDays or XP.
export const registerPracticeDay = (profile, dayKey, { weeklyGoalDays } = {}) => {
    const goal = Math.max(1, Number(weeklyGoalDays) || Number(profile?.weeklyGoalDays) || 3);
    const days = Array.from(new Set([...(profile?.practiceDays || []), dayKey]))
        .sort()
        .slice(-PRACTICE_DAYS_KEPT);
    const weekKey = weekKeyForDateKey(dayKey);
    const daysThisWeek = days.filter((day) => weekKeyForDateKey(day) === weekKey).length;

    let lastQualifiedWeek = profile?.lastQualifiedWeek || '';
    let streakWeeks = Math.max(0, Number(profile?.streakWeeks) || 0);
    let longestStreakWeeks = Math.max(0, Number(profile?.longestStreakWeeks) || 0);
    let qualifiedThisWeek = false;

    if (daysThisWeek >= goal && lastQualifiedWeek !== weekKey) {
        qualifiedThisWeek = true;
        streakWeeks = lastQualifiedWeek && lastQualifiedWeek === previousWeekKey(weekKey)
            ? streakWeeks + 1
            : 1;
        longestStreakWeeks = Math.max(longestStreakWeeks, streakWeeks);
        lastQualifiedWeek = weekKey;
    }

    return {
        practiceDays: days,
        weeklyGoalDays: goal,
        lastQualifiedWeek,
        streakWeeks,
        longestStreakWeeks,
        qualifiedThisWeek,
        daysThisWeek
    };
};

export const BADGE_RULES = Object.freeze([
    { key: 'first_practice', label: 'First practice' },
    { key: 'level_5', label: 'Level 5' },
    { key: 'streak_4', label: 'Four-week streak' },
    { key: 'hundred_answers', label: '100 answers' }
]);

// Adds any newly earned badges without ever removing one.
export const earnedBadges = ({ xp = 0, streakWeeks = 0, totalAttempts = 0 } = {}) => {
    const badges = [];
    if (totalAttempts > 0) badges.push('first_practice');
    if (levelForXp(xp).level >= 5) badges.push('level_5');
    if (streakWeeks >= 4) badges.push('streak_4');
    if (totalAttempts >= 100) badges.push('hundred_answers');
    return badges;
};

export const mergeBadges = (existing, earned) => Array.from(new Set([...(existing || []), ...(earned || [])]));
