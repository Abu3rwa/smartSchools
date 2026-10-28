const MINUTE_MS = 60000;

const toTime = (value) => {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
};

const clampWindow = (start, end, window) => {
    const from = Math.max(start, window.start);
    const to = Math.min(end, window.end);
    return to > from ? [from, to] : null;
};

const mergeWindows = (windows) => {
    const sorted = windows
        .filter(Boolean)
        .slice()
        .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const window of sorted) {
        const last = merged[merged.length - 1];
        if (last && window[0] <= last[1]) {
            last[1] = Math.max(last[1], window[1]);
        } else {
            merged.push([window[0], window[1]]);
        }
    }
    return merged;
};

const overlapMs = (windows, range) => {
    let total = 0;
    for (const window of windows) {
        const from = Math.max(window[0], range[0]);
        const to = Math.min(window[1], range[1]);
        if (to > from) total += to - from;
    }
    return total;
};

export const getSessionWindow = (session = {}, now = new Date()) => {
    const start = toTime(session.startedAt);
    if (start === null) return null;
    const end = toTime(session.endedAt) ?? toTime(now);
    if (end === null || end <= start) return null;
    return { start, end };
};

export const getPauseWindows = (events = [], session = {}, now = new Date()) => {
    const window = getSessionWindow(session, now);
    if (!window) return [];

    const windows = [];
    let pausedAt = null;
    let sawPauseEvent = false;

    for (const event of events) {
        const at = toTime(event.at);
        if (at === null) continue;
        if (event.type === 'session:paused') {
            sawPauseEvent = true;
            if (pausedAt === null) pausedAt = at;
        } else if (event.type === 'session:resumed' || event.type === 'session:ended') {
            if (pausedAt !== null) {
                windows.push(clampWindow(pausedAt, at, window));
                pausedAt = null;
            }
        }
    }

    if (pausedAt !== null) windows.push(clampWindow(pausedAt, window.end, window));

    if (!sawPauseEvent && session.paused && session.pausedAt) {
        windows.push(clampWindow(toTime(session.pausedAt), window.end, window));
    }

    return mergeWindows(windows);
};

export const getPresenceSegments = (events = [], window) => {
    const segments = new Map();
    const openJoins = new Map();

    for (const event of events) {
        const at = toTime(event.at);
        if (at === null) continue;
        const studentId = String(event?.payload?.studentId || event?.actor?.userId || '');
        if (!studentId) continue;
        if (event.type === 'presence:joined') {
            if (!openJoins.has(studentId)) openJoins.set(studentId, at);
        } else if (event.type === 'presence:left' && openJoins.has(studentId)) {
            const from = openJoins.get(studentId);
            openJoins.delete(studentId);
            const segment = clampWindow(from, at, window);
            if (segment) {
                if (!segments.has(studentId)) segments.set(studentId, []);
                segments.get(studentId).push(segment);
            }
        }
    }

    for (const [studentId, from] of openJoins.entries()) {
        const segment = clampWindow(from, window.end, window);
        if (segment) {
            if (!segments.has(studentId)) segments.set(studentId, []);
            segments.get(studentId).push(segment);
        }
    }

    for (const [studentId, list] of segments.entries()) {
        segments.set(studentId, mergeWindows(list));
    }
    return segments;
};

export const billableMsFromSegments = (segments = [], pauseWindows = []) => {
    let total = 0;
    for (const segment of segments) {
        total += (segment[1] - segment[0]) - overlapMs(pauseWindows, segment);
    }
    return Math.max(0, total);
};

export const minutesFromMs = (ms) => Math.max(0, Number(ms) || 0) / MINUTE_MS;

export const roundBillableMinutes = (rawMinutes, settings = {}, { graceMinutes } = {}) => {
    const noShowMinutes = Math.max(0, Number(settings.noShowMinutes) || 0);
    const minutes = Math.max(0, Number(rawMinutes) || 0);
    if (minutes <= 0) return noShowMinutes;

    const grace = Math.max(0, Number(graceMinutes ?? settings.graceMinutes) || 0);
    const billable = Math.max(0, minutes - grace);
    if (billable <= 0) return 0;

    const step = Number(settings.roundingMinutes) > 0 ? Number(settings.roundingMinutes) : 1;
    const minimum = Math.max(0, Number(settings.minimumBillableMinutes) || 0);
    const rounded = Math.ceil(billable / step) * step;
    return Math.max(rounded, minimum);
};

export const amountFromMinutes = (minutes, hourlyRate) => {
    const value = (Math.max(0, Number(minutes) || 0) / 60) * Math.max(0, Number(hourlyRate) || 0);
    return Math.round(value * 100) / 100;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const rateIsEffective = (row, at) => {
    if (!row) return false;
    const time = at ? new Date(at).getTime() : Date.now();
    if (!Number.isFinite(time)) return true;
    const from = row.effectiveFrom ? new Date(row.effectiveFrom).getTime() : null;
    const to = row.effectiveTo ? new Date(row.effectiveTo).getTime() + DAY_MS - 1 : null;
    if (from !== null && Number.isFinite(from) && time < from) return false;
    if (to !== null && Number.isFinite(to) && time > to) return false;
    return true;
};

const pickLatestEffective = (rows, at) => {
    const effective = (rows || []).filter((row) => rateIsEffective(row, at));
    if (!effective.length) return null;
    return effective
        .slice()
        .sort((a, b) => {
            const aFrom = a.effectiveFrom ? new Date(a.effectiveFrom).getTime() : 0;
            const bFrom = b.effectiveFrom ? new Date(b.effectiveFrom).getTime() : 0;
            return bFrom - aFrom;
        })[0];
};

/**
 * Rate priority: student override, class rate, then the school default. Each
 * row can carry an effective window, so a scheduled change only applies to
 * lessons dated inside that window. Existing charges keep their snapshot.
 */
export const resolveHourlyRate = (settings = {}, { classId, studentId, at } = {}) => {
    if (studentId) {
        const studentRate = pickLatestEffective(
            (settings.studentRates || []).filter((rate) => rate && String(rate.studentId) === String(studentId)),
            at
        );
        if (studentRate) {
            return { rate: Number(studentRate.hourlyRate) || 0, source: 'student', reason: studentRate.reason || '' };
        }
    }

    if (classId) {
        const classRate = pickLatestEffective(
            (settings.classRates || []).filter((rate) => rate && String(rate.classId) === String(classId)),
            at
        );
        if (classRate) {
            return { rate: Number(classRate.hourlyRate) || 0, source: 'class', reason: classRate.reason || '' };
        }
    }

    return { rate: Number(settings.defaultHourlyRate) || 0, source: 'school', reason: '' };
};

export const packageHourlyRate = (purchase) => {
    const minutes = Number(purchase?.minutesIncluded) || 0;
    const price = Number(purchase?.price) || 0;
    if (minutes <= 0 || price <= 0) return 0;
    return Math.round((price / (minutes / 60)) * 100) / 100;
};

/**
 * Price a manually entered lesson. The teacher types the time the lesson ran;
 * rounding and the minimum are the same rules auto-billed sessions follow.
 * basis lets staff record a no-show or a late cancellation explicitly.
 */
export const buildLessonCharge = (enteredMinutes, settings = {}, { classId, studentId, at, basis = 'attended' } = {}) => {
    const { rate, source, reason } = resolveHourlyRate(settings, { classId, studentId, at });
    let minutes;
    if (basis === 'no-show') {
        minutes = Math.max(0, Number(settings.noShowMinutes) || 0);
    } else if (basis === 'late-cancellation') {
        const lateMinutes = Number(settings.lateCancellationMinutes) || Number(settings.noShowMinutes) || 0;
        minutes = Math.max(0, lateMinutes);
    } else {
        minutes = roundBillableMinutes(enteredMinutes, settings);
    }
    return {
        minutes,
        hourlyRate: rate,
        rateSource: source,
        rateReason: reason,
        basis,
        amount: amountFromMinutes(minutes, rate)
    };
};

/**
 * How one ledger entry moves the balance: positive is money the family has
 * with the school, negative is money owed.
 */
export const balanceDelta = (entry = {}) => {
    if (!entry || entry.status === 'void') return 0;
    const amount = Math.abs(Number(entry.amount) || 0);
    switch (entry.kind) {
        case 'payment':
            return amount;
        case 'refund':
            return -amount;
        case 'adjustment':
            return entry.direction === 'debit' ? -amount : amount;
        case 'charge':
            return -amount;
        default:
            return 0;
    }
};

export const summarizeEntries = (entries = []) => {
    let charged = 0;
    let paid = 0;
    let refunded = 0;
    let credited = 0;
    let debited = 0;
    let minutes = 0;
    let sessions = 0;
    let balance = 0;

    for (const entry of entries) {
        if (!entry || entry.status === 'void') continue;
        const amount = Math.abs(Number(entry.amount) || 0);
        if (entry.kind === 'charge') {
            charged += amount;
            minutes += Number(entry.minutes) || 0;
            // Manual charges are lessons too, even without a platform session.
            sessions += 1;
        } else if (entry.kind === 'payment') {
            paid += amount;
        } else if (entry.kind === 'refund') {
            refunded += amount;
        } else if (entry.kind === 'adjustment') {
            if (entry.direction === 'debit') debited += amount;
            else credited += amount;
        }
        balance += balanceDelta(entry);
    }

    const round2 = (value) => Math.round(value * 100) / 100;
    return {
        charged: round2(charged),
        paid: round2(paid),
        refunded: round2(refunded),
        credited: round2(credited),
        debited: round2(debited),
        minutes: Math.round(minutes * 10) / 10,
        sessions,
        balance: round2(balance)
    };
};

export const estimateMinutesRemaining = (balance, hourlyRate) => {
    const rate = Number(hourlyRate) || 0;
    if (balance <= 0 || rate <= 0) return 0;
    return Math.floor((balance / rate) * 60);
};

export const isAdjustmentCredit = (entry = {}) => (
    entry.kind === 'adjustment' && entry.direction !== 'debit'
);
