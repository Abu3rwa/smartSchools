// Leaderboard reads are pure aggregations over trusted reward events; the
// only write is the idempotent podium settlement for the previous period.
import mongoose from 'mongoose';
import GameRewardEvent from '../models/GameRewardEvent.js';
import GameProfile from '../models/GameProfile.js';
import {
    getDatePartsInTimeZone,
    shiftLocalYmd,
    ymdKey,
    zonedDateTimeToUtc
} from '../utils/schoolTimezone.js';
import { dateKeyFor, weekKeyForDateKey } from './languageGameScoring.js';

const oid = (value) => new mongoose.Types.ObjectId(String(value));

const boundsFromMonday = (monday, timeZone) => ({
    window: 'week',
    periodKey: weekKeyForDateKey(ymdKey(monday)),
    start: zonedDateTimeToUtc(monday, timeZone),
    end: zonedDateTimeToUtc(shiftLocalYmd(monday, 7), timeZone)
});

const boundsFromMonth = (year, month, timeZone) => {
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    return {
        window: 'month',
        periodKey: `${year}-${String(month).padStart(2, '0')}`,
        start: zonedDateTimeToUtc({ year, month, day: 1 }, timeZone),
        end: zonedDateTimeToUtc({ ...next, day: 1 }, timeZone)
    };
};

const localMonday = (now, timeZone) => {
    const local = getDatePartsInTimeZone(now, timeZone);
    return shiftLocalYmd(local, -((local.weekday + 6) % 7));
};

// Current period in the school timezone. 'all' has no bounds.
export const windowBoundsFor = (window, now, timeZone) => {
    if (window === 'month') {
        const local = getDatePartsInTimeZone(now, timeZone);
        return boundsFromMonth(local.year, local.month, timeZone);
    }
    if (window === 'week') return boundsFromMonday(localMonday(now, timeZone), timeZone);
    return { window: 'all', periodKey: 'all', start: null, end: null };
};

// The most recently closed period; podium badges settle against this one.
export const previousWindowBoundsFor = (window, now, timeZone) => {
    if (window === 'month') {
        const local = getDatePartsInTimeZone(now, timeZone);
        const previous = local.month === 1 ? { year: local.year - 1, month: 12 } : { year: local.year, month: local.month - 1 };
        return boundsFromMonth(previous.year, previous.month, timeZone);
    }
    if (window === 'week') return boundsFromMonday(shiftLocalYmd(localMonday(now, timeZone), -7), timeZone);
    return null;
};

// subjectId: undefined = every subject combined, null = the General bucket.
export const leaderboardMatch = ({ schoolId, classId, subjectId, bounds }) => {
    const match = { school: oid(schoolId), source: 'practice' };
    if (classId) match.classes = oid(classId);
    if (subjectId !== undefined) match.subject = subjectId ? oid(subjectId) : null;
    if (bounds?.start) match.createdAt = { $gte: bounds.start, $lt: bounds.end };
    return match;
};

export const leaderboardPipeline = (match) => [
    { $match: match },
    {
        $group: {
            _id: '$student',
            xp: { $sum: '$amount' },
            attempts: { $sum: '$attempts' },
            correct: { $sum: '$correct' }
        }
    },
    { $sort: { xp: -1 } }
];

export const accuracyFor = (correct, attempts) => (attempts > 0 ? Math.round((correct / attempts) * 100) : null);

// Equal XP is broken by accuracy so a capped board still shows who is
// stronger; below the threshold the sample is too small to count.
export const TIE_BREAK_MIN_ATTEMPTS = 20;

const tieBreakAccuracy = (row) => {
  const attempts = Number(row?.attempts) || 0;
  if (attempts < TIE_BREAK_MIN_ATTEMPTS) return -1;
  return accuracyFor(Number(row?.correct) || 0, attempts) ?? -1;
};

export const compareLeaderboardRows = (a, b) => {
  const xpDiff = (Number(b?.xp) || 0) - (Number(a?.xp) || 0);
  if (xpDiff !== 0) return xpDiff;
  const accuracyDiff = tieBreakAccuracy(b) - tieBreakAccuracy(a);
  if (accuracyDiff !== 0) return accuracyDiff;
  return String(a?.displayName ?? a?._id ?? '').localeCompare(String(b?.displayName ?? b?._id ?? ''));
};

// Students see first name + last initial only; staff see full names.
export const displayNameFor = (student, masked) => {
    const first = String(student?.firstName || '').trim();
    const last = String(student?.lastName || '').trim();
    if (!masked) return [first, last].filter(Boolean).join(' ');
    return last ? `${first} ${last.charAt(0)}.` : first;
};

export const podiumBadgeKey = ({ window, periodKey, scope, subjectCode }) => `podium_${window}_${periodKey}_${scope}_${subjectCode}`;

// Settles the previous period's top 3 for the board being read. The unique
// reward key makes a second read (or a second viewer) grant nothing new.
export const settlePreviousPodium = async ({ schoolId, scope, classId, subjectId, subjectCode, window, now, timeZone }) => {
    const bounds = previousWindowBoundsFor(window, now, timeZone);
    if (!bounds) return [];
    const rows = await GameRewardEvent.aggregate(leaderboardPipeline(leaderboardMatch({ schoolId, classId, subjectId, bounds })));
    const top = rows.sort(compareLeaderboardRows).filter((row) => row.xp > 0).slice(0, 3);
    const granted = [];
    for (const row of top) {
        const badge = podiumBadgeKey({ window, periodKey: bounds.periodKey, scope, subjectCode });
        try {
            await GameRewardEvent.create({
                school: schoolId,
                student: row._id,
                source: 'leaderboard',
                ruleKey: 'podium',
                amount: 0,
                uniqueKey: `podium:${window}:${bounds.periodKey}:${scope}:${subjectCode}:${row._id}`,
                subject: subjectId || null,
                classes: classId ? [oid(classId)] : [],
                dayKey: dateKeyFor(now, timeZone),
                attempts: 0,
                correct: 0
            });
        } catch (error) {
            if (error?.code !== 11000) throw error;
            continue;
        }
        await GameProfile.updateOne({ school: schoolId, student: row._id }, { $addToSet: { badges: badge } });
        granted.push({ student: row._id, badge });
    }
    return granted;
};