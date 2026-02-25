import mongoose from 'mongoose';
import CalendarEvent, {
    CALENDAR_EVENT_CATEGORIES,
    CALENDAR_EVENT_RECURRENCE_FREQUENCIES,
    CALENDAR_EVENT_STATUSES
} from '../models/CalendarEvent.js';
import CalendarNotificationPreference from '../models/CalendarNotificationPreference.js';
import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import { getTeacherClassIds } from '../helpers/teacherScoping.js';
import { getParentLinkedStudents } from './parentDashboardService.js';
import { PERMISSIONS, hasPermission } from '../config/permissions.js';
import { resolveSchoolAcademicYear } from '../utils/academicYear.js';

const CATEGORY_SET = new Set(CALENDAR_EVENT_CATEGORIES);
const RECURRENCE_FREQUENCY_SET = new Set(CALENDAR_EVENT_RECURRENCE_FREQUENCIES);
const STATUS_SET = new Set(CALENDAR_EVENT_STATUSES);
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_QUERY_BASE_EVENTS = 1200;
const MAX_RANGE_OCCURRENCES_PER_EVENT = 260;
const MAX_UPCOMING_OCCURRENCES_PER_EVENT = 220;

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toId = (value) => (value == null ? '' : String(value));

const buildHttpError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const normalizeObjectIdArray = (values = []) => {
    if (!Array.isArray(values)) return [];
    const unique = new Set();
    values.forEach((value) => {
        const normalized = toId(value).trim();
        if (OBJECT_ID_REGEX.test(normalized)) {
            unique.add(normalized);
        }
    });
    return [...unique];
};

const normalizeGradeArray = (values = []) => {
    if (!Array.isArray(values)) return [];
    const unique = new Set();
    values.forEach((value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 12) {
            unique.add(parsed);
        }
    });
    return [...unique];
};

const normalizeEmailArray = (values = []) => {
    if (!Array.isArray(values)) return [];
    const unique = new Set();
    values.forEach((value) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized) {
            unique.add(normalized);
        }
    });
    return [...unique];
};

const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
};

const normalizeWeekdayArray = (values = []) => {
    if (!Array.isArray(values)) return [];
    const unique = new Set();
    values.forEach((value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
            unique.add(parsed);
        }
    });
    return [...unique].sort((left, right) => left - right);
};

const addUtcMonths = (date, months) => {
    const source = new Date(date);
    return new Date(Date.UTC(
        source.getUTCFullYear(),
        source.getUTCMonth() + months,
        source.getUTCDate(),
        source.getUTCHours(),
        source.getUTCMinutes(),
        source.getUTCSeconds(),
        source.getUTCMilliseconds()
    ));
};

const startOfUtcWeek = (date) => {
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    utcDate.setUTCDate(utcDate.getUTCDate() - utcDate.getUTCDay());
    return utcDate;
};

const recurrenceWindowMatches = (occurrenceStart, occurrenceEnd, fromDate, toDate) => (
    occurrenceStart <= toDate && occurrenceEnd >= fromDate
);

const normalizeRecurrence = (input, { partial = false, startAt = null, existingRecurrence = null } = {}) => {
    if (input == null) {
        return partial ? undefined : { isRecurring: false };
    }
    if (typeof input !== 'object' || Array.isArray(input)) {
        throw buildHttpError(400, 'recurrence must be an object');
    }

    const hasKnownField = ['isRecurring', 'frequency', 'interval', 'weekDays', 'until']
        .some((key) => Object.prototype.hasOwnProperty.call(input, key));
    if (partial && !hasKnownField) return undefined;

    const hasPatternField = ['frequency', 'interval', 'weekDays', 'until']
        .some((key) => Object.prototype.hasOwnProperty.call(input, key));
    const isRecurring = Object.prototype.hasOwnProperty.call(input, 'isRecurring')
        ? Boolean(input.isRecurring)
        : (hasPatternField || existingRecurrence?.isRecurring === true);

    if (!isRecurring) {
        return { isRecurring: false };
    }

    const frequency = String(
        Object.prototype.hasOwnProperty.call(input, 'frequency')
            ? input.frequency
            : existingRecurrence?.frequency || ''
    ).trim().toUpperCase();
    if (!RECURRENCE_FREQUENCY_SET.has(frequency)) {
        throw buildHttpError(400, `recurrence.frequency must be one of: ${CALENDAR_EVENT_RECURRENCE_FREQUENCIES.join(', ')}`);
    }

    const rawInterval = Object.prototype.hasOwnProperty.call(input, 'interval')
        ? input.interval
        : existingRecurrence?.interval ?? 1;
    const interval = Number.parseInt(rawInterval, 10);
    if (!Number.isInteger(interval) || interval < 1 || interval > 52) {
        throw buildHttpError(400, 'recurrence.interval must be between 1 and 52');
    }

    const fallbackStart = parseDate(startAt);
    const rawWeekDays = Object.prototype.hasOwnProperty.call(input, 'weekDays')
        ? input.weekDays
        : existingRecurrence?.weekDays;
    let weekDays = normalizeWeekdayArray(rawWeekDays);
    if (frequency === 'WEEKLY' && weekDays.length === 0 && fallbackStart) {
        weekDays = [fallbackStart.getUTCDay()];
    }
    if (frequency === 'WEEKLY' && weekDays.length === 0) {
        throw buildHttpError(400, 'recurrence.weekDays is required for WEEKLY recurrence');
    }
    if (frequency !== 'WEEKLY') {
        weekDays = [];
    }

    let until = null;
    if (Object.prototype.hasOwnProperty.call(input, 'until')) {
        if (input.until == null || input.until === '') {
            until = null;
        } else {
            until = parseDate(input.until);
            if (!until) {
                throw buildHttpError(400, 'recurrence.until must be a valid ISO date');
            }
        }
    } else if (existingRecurrence?.until) {
        until = parseDate(existingRecurrence.until);
    }

    if (until && fallbackStart && until < fallbackStart) {
        throw buildHttpError(400, 'recurrence.until must be greater than or equal to startAt');
    }

    return {
        isRecurring: true,
        frequency,
        interval,
        weekDays,
        until
    };
};

const normalizeAudience = (input = {}, { partial = false } = {}) => {
    if (input == null) {
        return partial ? undefined : { visibility: 'SCHOOL_WIDE' };
    }
    const audience = typeof input === 'object' ? input : {};
    const visibility = String(audience.visibility || 'SCHOOL_WIDE').trim().toUpperCase();
    const normalized = {
        visibility,
        userIds: normalizeObjectIdArray(audience.userIds),
        emails: normalizeEmailArray(audience.emails),
        teacherIds: normalizeObjectIdArray(audience.teacherIds),
        classIds: normalizeObjectIdArray(audience.classIds),
        gradeIds: normalizeGradeArray(audience.gradeIds)
    };
    if (!partial) return normalized;

    const hasExplicitKeys = ['visibility', 'userIds', 'emails', 'teacherIds', 'classIds', 'gradeIds']
        .some((key) => Object.prototype.hasOwnProperty.call(audience, key));
    return hasExplicitKeys ? normalized : undefined;
};

const normalizeCalendarEventPayload = (payload = {}, { partial = false, existingEvent = null } = {}) => {
    const normalized = {};
    const source = payload || {};

    if (!partial || Object.prototype.hasOwnProperty.call(source, 'title')) {
        const title = String(source.title || '').trim();
        if (!partial && !title) {
            throw buildHttpError(400, 'title is required');
        }
        if (title) normalized.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(source, 'description')) {
        normalized.description = source.description == null ? '' : String(source.description).trim();
    }

    if (!partial || Object.prototype.hasOwnProperty.call(source, 'category')) {
        const category = String(source.category || '').trim().toUpperCase();
        if (!partial && !category) {
            throw buildHttpError(400, 'category is required');
        }
        if (category) normalized.category = category;
    }

    if (!partial || Object.prototype.hasOwnProperty.call(source, 'startAt')) {
        const startAt = parseDate(source.startAt);
        if (!partial && !startAt) {
            throw buildHttpError(400, 'startAt must be a valid ISO date');
        }
        if (startAt) normalized.startAt = startAt;
    }

    if (!partial || Object.prototype.hasOwnProperty.call(source, 'endAt')) {
        const endAt = parseDate(source.endAt);
        if (!partial && !endAt) {
            throw buildHttpError(400, 'endAt must be a valid ISO date');
        }
        if (endAt) normalized.endAt = endAt;
    }

    if (Object.prototype.hasOwnProperty.call(source, 'allDay')) {
        normalized.allDay = Boolean(source.allDay);
    } else if (!partial) {
        normalized.allDay = true;
    }

    if (Object.prototype.hasOwnProperty.call(source, 'location')) {
        normalized.location = source.location == null ? '' : String(source.location).trim();
    }

    const audience = normalizeAudience(source.audience, { partial });
    if (audience) {
        normalized.audience = audience;
    }

    const nextStartAt = normalized.startAt || existingEvent?.startAt || null;
    const recurrence = normalizeRecurrence(source.recurrence, {
        partial,
        startAt: nextStartAt,
        existingRecurrence: existingEvent?.recurrence
    });
    if (recurrence) {
        normalized.recurrence = recurrence;
    } else if (!partial) {
        normalized.recurrence = { isRecurring: false };
    }

    if (Object.prototype.hasOwnProperty.call(source, 'status')) {
        const status = String(source.status || '').trim().toUpperCase();
        if (status) normalized.status = status;
    }

    return normalized;
};

const resolveAudienceTargets = async ({ schoolId, audience }) => {
    if (!audience || typeof audience !== 'object') return audience;
    const visibility = String(audience.visibility || 'SCHOOL_WIDE').toUpperCase();
    if (visibility !== 'CUSTOM') {
        return {
            ...audience,
            userIds: [],
            emails: []
        };
    }
    const requestedIds = normalizeObjectIdArray(audience.userIds);
    const requestedEmails = normalizeEmailArray(audience.emails);
    if (requestedIds.length === 0 && requestedEmails.length === 0) {
        if (visibility === 'CUSTOM') {
            const hasOtherTargets = (
                (audience.teacherIds || []).length > 0
                || (audience.classIds || []).length > 0
                || (audience.gradeIds || []).length > 0
            );
            if (!hasOtherTargets) {
                throw buildHttpError(400, 'CUSTOM audience requires recipient emails or IDs');
            }
        }
        return {
            ...audience,
            userIds: [],
            emails: []
        };
    }

    const userQuery = {
        school: schoolId,
        isActive: true,
        $or: [
            ...(requestedIds.length > 0 ? [{ _id: { $in: requestedIds } }] : []),
            ...(requestedEmails.length > 0 ? [{ email: { $in: requestedEmails } }] : [])
        ]
    };
    const users = await User.find(userQuery)
        .select('_id email')
        .lean();
    const foundIdSet = new Set(users.map((item) => toId(item._id)));
    const foundEmailSet = new Set(users.map((item) => String(item.email || '').trim().toLowerCase()));

    const missingEmails = requestedEmails.filter((email) => !foundEmailSet.has(email));
    if (missingEmails.length > 0) {
        throw buildHttpError(400, `These emails do not belong to active users in this school: ${missingEmails.join(', ')}`);
    }
    const missingUserIds = requestedIds.filter((id) => !foundIdSet.has(id));
    if (missingUserIds.length > 0) {
        throw buildHttpError(400, 'Some selected users are not active members of this school');
    }

    const mergedUserIds = [...new Set([...requestedIds, ...users.map((item) => toId(item._id))])];
    return {
        ...audience,
        userIds: mergedUserIds,
        emails: requestedEmails
    };
};

const mapCalendarEvent = (event) => {
    if (!event) return null;
    const mappedId = toId(event._id);
    const mappedRecurrence = event.recurrence?.isRecurring === true
        ? {
            isRecurring: true,
            frequency: event.recurrence?.frequency || null,
            interval: Number.isInteger(event.recurrence?.interval) ? event.recurrence.interval : 1,
            weekDays: Array.isArray(event.recurrence?.weekDays)
                ? normalizeWeekdayArray(event.recurrence.weekDays)
                : [],
            until: event.recurrence?.until || null
        }
        : {
            isRecurring: false,
            frequency: null,
            interval: 1,
            weekDays: [],
            until: null
        };

    return {
        id: mappedId,
        instanceId: toId(event.instanceId) || mappedId,
        schoolId: toId(event.school),
        title: event.title || '',
        description: event.description || '',
        category: event.category,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay !== false,
        location: event.location || '',
        audience: {
            visibility: event.audience?.visibility || 'SCHOOL_WIDE',
            userIds: (event.audience?.userIds || []).map((id) => toId(id)),
            emails: (event.audience?.emails || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean),
            teacherIds: (event.audience?.teacherIds || []).map((id) => toId(id)),
            classIds: (event.audience?.classIds || []).map((id) => toId(id)),
            gradeIds: (event.audience?.gradeIds || []).map((value) => Number(value))
        },
        recurrence: mappedRecurrence,
        createdBy: toId(event.createdBy),
        updatedBy: toId(event.updatedBy),
        status: event.status || 'ACTIVE',
        createdAt: event.createdAt,
        updatedAt: event.updatedAt
    };
};

const mapNotificationPreference = (preference) => ({
    enabled: preference?.enabled !== false,
    categoriesEnabled: Array.isArray(preference?.categoriesEnabled) && preference.categoriesEnabled.length > 0
        ? preference.categoriesEnabled
        : CalendarNotificationPreference.defaultCategoriesEnabled(),
    mutedEventIds: Array.isArray(preference?.mutedEventIds)
        ? preference.mutedEventIds.map((id) => toId(id))
        : []
});

const ensureManagePermission = (user) => {
    if (!canManageCalendar(user)) {
        throw buildHttpError(403, 'Not authorized to manage school calendar events');
    }
};

const getRole = (user) => String(user?.role || '').trim();

const isAdminRole = (user) => ['admin', 'super_admin', 'department_principal'].includes(getRole(user));

export const canManageCalendar = (user) => {
    if (!user) return false;
    if (isAdminRole(user)) return true;
    return hasPermission(user, PERMISSIONS.MANAGE_EVENTS);
};

export const parseCalendarCategories = (rawValue) => {
    if (!rawValue) return [];
    const values = Array.isArray(rawValue) ? rawValue : String(rawValue).split(',');
    const categories = values
        .map((value) => String(value || '').trim().toUpperCase())
        .filter((value) => CATEGORY_SET.has(value));
    return [...new Set(categories)];
};

export const sortCalendarEventsByStartAt = (events = []) => {
    return [...events].sort((left, right) => {
        const leftMs = new Date(left?.startAt || 0).getTime();
        const rightMs = new Date(right?.startAt || 0).getTime();
        return leftMs - rightMs;
    });
};

const isRecurringEvent = (event) => event?.recurrence?.isRecurring === true;

const buildRecurringOccurrence = (event, occurrenceStart, durationMs, occurrenceIndex) => {
    const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
    return {
        ...event,
        startAt: occurrenceStart,
        endAt: occurrenceEnd,
        instanceId: `${toId(event?._id)}:${occurrenceStart.toISOString()}:${occurrenceIndex}`
    };
};

const expandCalendarEventForRange = (event, { fromDate, toDate, maxOccurrences = MAX_RANGE_OCCURRENCES_PER_EVENT }) => {
    const startAt = parseDate(event?.startAt);
    const endAt = parseDate(event?.endAt);
    if (!startAt || !endAt) return [];

    if (!isRecurringEvent(event)) {
        return recurrenceWindowMatches(startAt, endAt, fromDate, toDate) ? [event] : [];
    }

    const durationMs = Math.max(0, endAt.getTime() - startAt.getTime());
    const recurrence = event.recurrence || {};
    const frequency = String(recurrence.frequency || '').toUpperCase();
    const interval = Math.max(1, Number.parseInt(recurrence.interval, 10) || 1);
    const recurrenceUntil = parseDate(recurrence.until);
    const hardEnd = recurrenceUntil && recurrenceUntil < toDate ? recurrenceUntil : toDate;
    if (hardEnd < startAt) return [];

    const fromThreshold = new Date(fromDate.getTime() - durationMs);
    const occurrences = [];
    let occurrenceIndex = 0;

    const includeOccurrence = (occurrenceStart) => {
        const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
        if (recurrenceWindowMatches(occurrenceStart, occurrenceEnd, fromDate, toDate)) {
            occurrences.push(buildRecurringOccurrence(event, occurrenceStart, durationMs, occurrenceIndex));
        }
        occurrenceIndex += 1;
    };

    if (frequency === 'DAILY') {
        const stepMs = interval * DAY_MS;
        let cursor = new Date(startAt);
        if (fromThreshold > cursor) {
            const steps = Math.floor((fromThreshold.getTime() - cursor.getTime()) / stepMs);
            if (steps > 0) cursor = new Date(cursor.getTime() + (steps * stepMs));
            while (cursor < fromThreshold) {
                cursor = new Date(cursor.getTime() + stepMs);
            }
        }
        while (cursor <= hardEnd && occurrences.length < maxOccurrences) {
            includeOccurrence(cursor);
            cursor = new Date(cursor.getTime() + stepMs);
        }
        return occurrences;
    }

    if (frequency === 'MONTHLY') {
        let cursor = new Date(startAt);
        let guard = 0;
        while (cursor < fromThreshold && guard < 5000) {
            cursor = addUtcMonths(cursor, interval);
            guard += 1;
        }
        while (cursor <= hardEnd && occurrences.length < maxOccurrences && guard < 8000) {
            includeOccurrence(cursor);
            cursor = addUtcMonths(cursor, interval);
            guard += 1;
        }
        return occurrences;
    }

    const weekDays = normalizeWeekdayArray(recurrence.weekDays);
    const effectiveWeekDays = weekDays.length > 0 ? weekDays : [startAt.getUTCDay()];
    const anchorWeekStart = startOfUtcWeek(startAt);
    const thresholdWeekStart = startOfUtcWeek(fromThreshold > startAt ? fromThreshold : startAt);
    const weeksFromAnchor = Math.max(0, Math.floor((thresholdWeekStart.getTime() - anchorWeekStart.getTime()) / (7 * DAY_MS)));
    let blockIndex = Math.floor(weeksFromAnchor / interval);
    const startTimeOffset = (
        (startAt.getUTCHours() * 60 * 60 * 1000)
        + (startAt.getUTCMinutes() * 60 * 1000)
        + (startAt.getUTCSeconds() * 1000)
        + startAt.getUTCMilliseconds()
    );
    let guard = 0;

    while (occurrences.length < maxOccurrences && guard < 4000) {
        const weekStart = new Date(anchorWeekStart.getTime() + (blockIndex * interval * 7 * DAY_MS));
        if (weekStart > hardEnd) break;
        for (const weekDay of effectiveWeekDays) {
            const occurrenceStart = new Date(weekStart.getTime() + (weekDay * DAY_MS) + startTimeOffset);
            if (occurrenceStart < startAt || occurrenceStart < fromThreshold) continue;
            if (occurrenceStart > hardEnd) {
                return occurrences;
            }
            includeOccurrence(occurrenceStart);
            if (occurrences.length >= maxOccurrences) {
                return occurrences;
            }
        }
        blockIndex += 1;
        guard += 1;
    }

    return occurrences;
};

const expandCalendarEventForUpcoming = (event, { fromDate, maxOccurrences = MAX_UPCOMING_OCCURRENCES_PER_EVENT }) => {
    const startAt = parseDate(event?.startAt);
    const endAt = parseDate(event?.endAt);
    if (!startAt || !endAt) return [];

    if (!isRecurringEvent(event)) {
        return endAt >= fromDate ? [event] : [];
    }

    const durationMs = Math.max(0, endAt.getTime() - startAt.getTime());
    const recurrence = event.recurrence || {};
    const frequency = String(recurrence.frequency || '').toUpperCase();
    const interval = Math.max(1, Number.parseInt(recurrence.interval, 10) || 1);
    const recurrenceUntil = parseDate(recurrence.until);
    if (recurrenceUntil && recurrenceUntil < fromDate) return [];

    const occurrences = [];
    let occurrenceIndex = 0;
    const includeOccurrence = (occurrenceStart) => {
        if (occurrenceStart >= fromDate) {
            occurrences.push(buildRecurringOccurrence(event, occurrenceStart, durationMs, occurrenceIndex));
        }
        occurrenceIndex += 1;
    };

    if (frequency === 'DAILY') {
        const stepMs = interval * DAY_MS;
        let cursor = new Date(startAt);
        if (cursor < fromDate) {
            const steps = Math.floor((fromDate.getTime() - cursor.getTime()) / stepMs);
            if (steps > 0) cursor = new Date(cursor.getTime() + (steps * stepMs));
            while (cursor < fromDate) {
                cursor = new Date(cursor.getTime() + stepMs);
            }
        }
        while (occurrences.length < maxOccurrences) {
            if (recurrenceUntil && cursor > recurrenceUntil) break;
            includeOccurrence(cursor);
            cursor = new Date(cursor.getTime() + stepMs);
        }
        return occurrences;
    }

    if (frequency === 'MONTHLY') {
        let cursor = new Date(startAt);
        let guard = 0;
        while (cursor < fromDate && guard < 5000) {
            cursor = addUtcMonths(cursor, interval);
            guard += 1;
        }
        while (occurrences.length < maxOccurrences && guard < 9000) {
            if (recurrenceUntil && cursor > recurrenceUntil) break;
            includeOccurrence(cursor);
            cursor = addUtcMonths(cursor, interval);
            guard += 1;
        }
        return occurrences;
    }

    const weekDays = normalizeWeekdayArray(recurrence.weekDays);
    const effectiveWeekDays = weekDays.length > 0 ? weekDays : [startAt.getUTCDay()];
    const anchorWeekStart = startOfUtcWeek(startAt);
    const thresholdWeekStart = startOfUtcWeek(fromDate > startAt ? fromDate : startAt);
    const weeksFromAnchor = Math.max(0, Math.floor((thresholdWeekStart.getTime() - anchorWeekStart.getTime()) / (7 * DAY_MS)));
    let blockIndex = Math.floor(weeksFromAnchor / interval);
    const startTimeOffset = (
        (startAt.getUTCHours() * 60 * 60 * 1000)
        + (startAt.getUTCMinutes() * 60 * 1000)
        + (startAt.getUTCSeconds() * 1000)
        + startAt.getUTCMilliseconds()
    );
    let guard = 0;

    while (occurrences.length < maxOccurrences && guard < 6000) {
        const weekStart = new Date(anchorWeekStart.getTime() + (blockIndex * interval * 7 * DAY_MS));
        for (const weekDay of effectiveWeekDays) {
            const occurrenceStart = new Date(weekStart.getTime() + (weekDay * DAY_MS) + startTimeOffset);
            if (occurrenceStart < startAt || occurrenceStart < fromDate) continue;
            if (recurrenceUntil && occurrenceStart > recurrenceUntil) {
                return occurrences;
            }
            includeOccurrence(occurrenceStart);
            if (occurrences.length >= maxOccurrences) return occurrences;
        }
        blockIndex += 1;
        guard += 1;
    }

    return occurrences;
};

export const canUserSeeEvent = (user, event, context = {}) => {
    if (!user || !event) return false;
    if (canManageCalendar(user)) return true;

    const visibility = event.audience?.visibility || 'SCHOOL_WIDE';
    if (visibility === 'SCHOOL_WIDE') return true;

    const role = getRole(user);
    const teacherAudienceIds = new Set((context.teacherAudienceIds || []).map((id) => toId(id)));
    const teacherClassIds = new Set((context.teacherClassIds || []).map((id) => toId(id)));
    const parentClassIds = new Set((context.parentClassIds || []).map((id) => toId(id)));
    const parentGradeIds = new Set((context.parentGradeIds || []).map((value) => Number(value)));
    const currentUserId = toId(context.currentUserId || user._id);
    const studentClassId = toId(context.studentClassId);
    const studentGradeId = Number(context.studentGradeId);

    if (role === 'teacher') {
        if (visibility === 'TEACHERS_ONLY') return true;
        if (visibility === 'CUSTOM') {
            const userIds = (event.audience?.userIds || []).map((id) => toId(id));
            const teacherIds = (event.audience?.teacherIds || []).map((id) => toId(id));
            const classIds = (event.audience?.classIds || []).map((id) => toId(id));
            return userIds.includes(currentUserId)
                || teacherIds.some((id) => teacherAudienceIds.has(id))
                || classIds.some((id) => teacherClassIds.has(id));
        }
        return false;
    }

    if (role === 'parent') {
        if (visibility === 'PARENTS_ONLY') return true;
        if (visibility === 'CUSTOM') {
            const userIds = (event.audience?.userIds || []).map((id) => toId(id));
            const classIds = (event.audience?.classIds || []).map((id) => toId(id));
            const gradeIds = (event.audience?.gradeIds || []).map((value) => Number(value));
            return userIds.includes(currentUserId)
                || classIds.some((id) => parentClassIds.has(id))
                || gradeIds.some((value) => parentGradeIds.has(value));
        }
        return false;
    }

    if (role === 'student') {
        if (visibility === 'CUSTOM') {
            const userIds = (event.audience?.userIds || []).map((id) => toId(id));
            const classIds = (event.audience?.classIds || []).map((id) => toId(id));
            const gradeIds = (event.audience?.gradeIds || []).map((value) => Number(value));
            return userIds.includes(currentUserId)
                || (studentClassId && classIds.includes(studentClassId))
                || (Number.isInteger(studentGradeId) && gradeIds.includes(studentGradeId));
        }
        return visibility === 'PARENTS_ONLY' ? false : visibility === 'TEACHERS_ONLY' ? false : true;
    }

    if (role === 'staff') {
        if (visibility === 'TEACHERS_ONLY') return true;
        if (visibility === 'CUSTOM') {
            const userIds = (event.audience?.userIds || []).map((id) => toId(id));
            return userIds.includes(currentUserId);
        }
        return false;
    }

    if (visibility === 'CUSTOM') {
        const userIds = (event.audience?.userIds || []).map((id) => toId(id));
        return userIds.includes(currentUserId);
    }

    return false;
};

const resolveVisibilityContext = async ({ user, schoolId, academicYear }) => {
    const role = getRole(user);
    const context = {
        currentUserId: toId(user?._id),
        teacherAudienceIds: [],
        teacherClassIds: [],
        parentClassIds: [],
        parentGradeIds: [],
        studentClassId: null,
        studentGradeId: null
    };

    if (role === 'teacher') {
        const teacherProfile = await Teacher.findOne({
            school: schoolId,
            user: user._id,
            isActive: true
        })
            .select('_id')
            .lean();
        const teacherProfileId = toId(teacherProfile?._id);
        const classIds = teacherProfile?._id ? await getTeacherClassIds(teacherProfile._id) : [];
        context.teacherAudienceIds = [toId(user._id), teacherProfileId].filter(Boolean);
        context.teacherClassIds = classIds.map((classId) => toId(classId));
        return context;
    }

    if (role === 'parent') {
        const resolvedAcademicYear = academicYear
            || resolveSchoolAcademicYear(user?.school)
            || undefined;
        if (!resolvedAcademicYear) {
            return context;
        }
        const linkedStudents = await getParentLinkedStudents({
            schoolId,
            parentUser: user,
            academicYear: resolvedAcademicYear
        });
        const classIds = new Set();
        const gradeIds = new Set();
        linkedStudents.forEach((student) => {
            const classId = toId(student?.currentClass?._id || student?.currentClass);
            if (classId) classIds.add(classId);
            const gradeValue = Number.parseInt(student?.currentClass?.grade, 10);
            if (Number.isInteger(gradeValue)) gradeIds.add(gradeValue);
        });
        context.parentClassIds = [...classIds];
        context.parentGradeIds = [...gradeIds];
        return context;
    }

    if (role === 'student') {
        const student = await Student.findOne({
            school: schoolId,
            user: user._id,
            status: 'active'
        })
            .select('currentClass')
            .populate('currentClass', 'grade')
            .lean();
        context.studentClassId = toId(student?.currentClass?._id || student?.currentClass);
        const gradeValue = Number.parseInt(student?.currentClass?.grade, 10);
        context.studentGradeId = Number.isInteger(gradeValue) ? gradeValue : null;
    }

    return context;
};

export const buildCalendarVisibilityQuery = ({ user, context = {} }) => {
    if (!user) return { _id: { $exists: false } };
    if (canManageCalendar(user)) return {};

    const role = getRole(user);
    const currentUserId = toId(context.currentUserId || user?._id);
    if (role === 'teacher') {
        const teacherAudienceIds = (context.teacherAudienceIds || []).filter(Boolean);
        const teacherClassIds = (context.teacherClassIds || []).filter(Boolean);
        const customConditions = [
            ...(currentUserId ? [{ 'audience.userIds': currentUserId }] : []),
            ...(teacherAudienceIds.length > 0 ? [{ 'audience.teacherIds': { $in: teacherAudienceIds } }] : []),
            ...(teacherClassIds.length > 0 ? [{ 'audience.classIds': { $in: teacherClassIds } }] : [])
        ];
        return {
            $or: [
                { 'audience.visibility': 'SCHOOL_WIDE' },
                { 'audience.visibility': 'TEACHERS_ONLY' },
                ...(customConditions.length > 0 ? [{
                    $and: [
                        { 'audience.visibility': 'CUSTOM' },
                        { $or: customConditions }
                    ]
                }] : [])
            ]
        };
    }

    if (role === 'parent') {
        const classIds = (context.parentClassIds || []).filter(Boolean);
        const gradeIds = (context.parentGradeIds || []).filter((value) => Number.isInteger(Number(value)));
        const customConditions = [
            ...(currentUserId ? [{ 'audience.userIds': currentUserId }] : []),
            ...(classIds.length > 0 ? [{ 'audience.classIds': { $in: classIds } }] : []),
            ...(gradeIds.length > 0 ? [{ 'audience.gradeIds': { $in: gradeIds } }] : [])
        ];
        return {
            $or: [
                { 'audience.visibility': 'SCHOOL_WIDE' },
                { 'audience.visibility': 'PARENTS_ONLY' },
                ...(customConditions.length > 0 ? [{
                    $and: [
                        { 'audience.visibility': 'CUSTOM' },
                        { $or: customConditions }
                    ]
                }] : [])
            ]
        };
    }

    if (role === 'student') {
        const studentClassId = toId(context.studentClassId);
        const studentGradeId = Number.parseInt(context.studentGradeId, 10);
        const customConditions = [
            ...(currentUserId ? [{ 'audience.userIds': currentUserId }] : []),
            ...(studentClassId ? [{ 'audience.classIds': studentClassId }] : []),
            ...(Number.isInteger(studentGradeId) ? [{ 'audience.gradeIds': studentGradeId }] : [])
        ];
        return {
            $or: [
                { 'audience.visibility': 'SCHOOL_WIDE' },
                ...(customConditions.length > 0 ? [{
                    $and: [
                        { 'audience.visibility': 'CUSTOM' },
                        { $or: customConditions }
                    ]
                }] : [])
            ]
        };
    }

    if (role === 'staff') {
        return {
            $or: [
                { 'audience.visibility': 'SCHOOL_WIDE' },
                { 'audience.visibility': 'TEACHERS_ONLY' },
                ...(currentUserId ? [{
                    $and: [
                        { 'audience.visibility': 'CUSTOM' },
                        { 'audience.userIds': currentUserId }
                    ]
                }] : [])
            ]
        };
    }

    return {
        $or: [
            { 'audience.visibility': 'SCHOOL_WIDE' },
            ...(currentUserId ? [{
                $and: [
                    { 'audience.visibility': 'CUSTOM' },
                    { 'audience.userIds': currentUserId }
                ]
            }] : [])
        ]
    };
};

export const buildCalendarDateRange = ({ from, to, now = new Date() }) => {
    const parsedFrom = parseDate(from);
    const parsedTo = parseDate(to);
    const fallbackStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const fallbackEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const fromDate = parsedFrom || fallbackStart;
    const toDate = parsedTo || fallbackEnd;

    if (fromDate > toDate) {
        throw buildHttpError(400, 'from must be less than or equal to to');
    }
    const spanMs = toDate.getTime() - fromDate.getTime();
    const maxSpanMs = 400 * 24 * 60 * 60 * 1000;
    if (spanMs > maxSpanMs) {
        throw buildHttpError(400, 'Date range cannot exceed 400 days');
    }

    return { fromDate, toDate };
};

export const buildCalendarEventListQuery = ({
    schoolId,
    fromDate,
    toDate,
    categories = [],
    status = 'ACTIVE',
    search = '',
    visibilityQuery = {}
}) => {
    const query = {
        school: schoolId
    };

    if (status && STATUS_SET.has(status)) {
        query.status = status;
    }
    if (categories.length > 0) {
        query.category = { $in: categories };
    }

    const normalizedSearch = String(search || '').trim();
    const queryAnd = [{
        $or: [
            {
                $and: [
                    { $or: [{ 'recurrence.isRecurring': { $ne: true } }, { recurrence: { $exists: false } }] },
                    { startAt: { $lte: toDate } },
                    { endAt: { $gte: fromDate } }
                ]
            },
            {
                $and: [
                    { 'recurrence.isRecurring': true },
                    { startAt: { $lte: toDate } },
                    {
                        $or: [
                            { 'recurrence.until': null },
                            { 'recurrence.until': { $exists: false } },
                            { 'recurrence.until': { $gte: fromDate } }
                        ]
                    }
                ]
            }
        ]
    }];

    if (normalizedSearch) {
        const regex = new RegExp(escapeRegex(normalizedSearch), 'i');
        queryAnd.push({ $or: [{ title: regex }, { description: regex }, { location: regex }] });
    }

    if (visibilityQuery && Object.keys(visibilityQuery).length > 0) {
        queryAnd.push(visibilityQuery);
    }

    if (queryAnd.length > 0) {
        query.$and = queryAnd;
    }

    return query;
};

export const createCalendarEvent = async ({ schoolId, user, payload }) => {
    ensureManagePermission(user);
    const normalized = normalizeCalendarEventPayload(payload, { partial: false, existingEvent: null });
    if (normalized.audience) {
        normalized.audience = await resolveAudienceTargets({
            schoolId,
            audience: normalized.audience
        });
    }

    if (!CATEGORY_SET.has(normalized.category)) {
        throw buildHttpError(400, `Invalid category. Allowed: ${CALENDAR_EVENT_CATEGORIES.join(', ')}`);
    }
    if (normalized.endAt < normalized.startAt) {
        throw buildHttpError(400, 'endAt must be greater than or equal to startAt');
    }
    if (normalized.recurrence?.isRecurring && normalized.recurrence?.until && normalized.recurrence.until < normalized.startAt) {
        throw buildHttpError(400, 'recurrence.until must be greater than or equal to startAt');
    }

    const event = await CalendarEvent.create({
        ...normalized,
        school: schoolId,
        createdBy: user._id,
        updatedBy: user._id
    });

    return mapCalendarEvent(event);
};

export const updateCalendarEvent = async ({ schoolId, user, eventId, payload }) => {
    ensureManagePermission(user);
    const event = await CalendarEvent.findOne({ _id: eventId, school: schoolId });
    if (!event) {
        throw buildHttpError(404, 'Calendar event not found');
    }

    const normalized = normalizeCalendarEventPayload(payload, { partial: true, existingEvent: event });
    if (normalized.audience) {
        normalized.audience = await resolveAudienceTargets({
            schoolId,
            audience: normalized.audience
        });
    }
    if (Object.keys(normalized).length === 0) {
        throw buildHttpError(400, 'At least one field is required to update the event');
    }
    if (normalized.category && !CATEGORY_SET.has(normalized.category)) {
        throw buildHttpError(400, `Invalid category. Allowed: ${CALENDAR_EVENT_CATEGORIES.join(', ')}`);
    }
    if (normalized.status && !STATUS_SET.has(normalized.status)) {
        throw buildHttpError(400, `Invalid status. Allowed: ${CALENDAR_EVENT_STATUSES.join(', ')}`);
    }

    const nextStartAt = normalized.startAt || event.startAt;
    const nextEndAt = normalized.endAt || event.endAt;
    if (nextEndAt < nextStartAt) {
        throw buildHttpError(400, 'endAt must be greater than or equal to startAt');
    }
    const nextRecurrence = normalized.recurrence || event.recurrence || { isRecurring: false };
    if (nextRecurrence?.isRecurring && nextRecurrence?.until && nextRecurrence.until < nextStartAt) {
        throw buildHttpError(400, 'recurrence.until must be greater than or equal to startAt');
    }

    Object.assign(event, normalized, { updatedBy: user._id });
    await event.save();

    return mapCalendarEvent(event);
};

export const cancelCalendarEvent = async ({ schoolId, user, eventId }) => {
    ensureManagePermission(user);
    const event = await CalendarEvent.findOne({ _id: eventId, school: schoolId });
    if (!event) {
        throw buildHttpError(404, 'Calendar event not found');
    }
    if (event.status !== 'CANCELLED') {
        event.status = 'CANCELLED';
        event.updatedBy = user._id;
        await event.save();
    }

    return mapCalendarEvent(event);
};

export const getCalendarEventById = async ({ schoolId, user, eventId, academicYear }) => {
    const visibilityContext = await resolveVisibilityContext({ user, schoolId, academicYear });
    const visibilityQuery = buildCalendarVisibilityQuery({ user, context: visibilityContext });

    const query = {
        _id: eventId,
        school: schoolId
    };
    if (visibilityQuery && Object.keys(visibilityQuery).length > 0) {
        query.$and = [visibilityQuery];
    }

    const event = await CalendarEvent.findOne(query);
    if (!event) {
        return null;
    }
    return mapCalendarEvent(event);
};

export const listCalendarEvents = async ({
    schoolId,
    user,
    academicYear,
    filters = {}
}) => {
    const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(filters.limit, 10) || 20));
    const categories = parseCalendarCategories(filters.category);
    const status = String(filters.status || 'ACTIVE').trim().toUpperCase();

    if (status && !STATUS_SET.has(status)) {
        throw buildHttpError(400, `Invalid status. Allowed: ${CALENDAR_EVENT_STATUSES.join(', ')}`);
    }

    const { fromDate, toDate } = buildCalendarDateRange({
        from: filters.from,
        to: filters.to
    });
    const visibilityContext = await resolveVisibilityContext({ user, schoolId, academicYear });
    const visibilityQuery = buildCalendarVisibilityQuery({ user, context: visibilityContext });

    const query = buildCalendarEventListQuery({
        schoolId,
        fromDate,
        toDate,
        categories,
        status,
        search: filters.search,
        visibilityQuery
    });

    const rows = await CalendarEvent.find(query)
        .sort({ startAt: 1, createdAt: 1 })
        .limit(MAX_QUERY_BASE_EVENTS)
        .lean();
    const expandedRows = sortCalendarEventsByStartAt(rows.flatMap((event) => expandCalendarEventForRange(event, {
        fromDate,
        toDate,
        maxOccurrences: MAX_RANGE_OCCURRENCES_PER_EVENT
    })));

    const total = expandedRows.length;
    const pageStartIndex = (page - 1) * limit;
    const pageRows = expandedRows.slice(pageStartIndex, pageStartIndex + limit);

    return {
        items: pageRows.map(mapCalendarEvent),
        pagination: {
            page,
            limit,
            total,
            hasMore: page * limit < total
        },
        range: {
            from: fromDate.toISOString(),
            to: toDate.toISOString()
        }
    };
};

export const listUpcomingCalendarEvents = async ({
    schoolId,
    user,
    academicYear,
    filters = {}
}) => {
    const limit = Math.min(50, Math.max(1, Number.parseInt(filters.limit, 10) || 10));
    const categories = parseCalendarCategories(filters.category);
    const fromDate = parseDate(filters.from) || new Date();

    const visibilityContext = await resolveVisibilityContext({ user, schoolId, academicYear });
    const visibilityQuery = buildCalendarVisibilityQuery({ user, context: visibilityContext });

    const query = {
        school: schoolId,
        status: 'ACTIVE'
    };
    if (categories.length > 0) {
        query.category = { $in: categories };
    }
    const queryAnd = [{
        $or: [
            {
                $and: [
                    { $or: [{ 'recurrence.isRecurring': { $ne: true } }, { recurrence: { $exists: false } }] },
                    { endAt: { $gte: fromDate } }
                ]
            },
            {
                $and: [
                    { 'recurrence.isRecurring': true },
                    {
                        $or: [
                            { 'recurrence.until': null },
                            { 'recurrence.until': { $exists: false } },
                            { 'recurrence.until': { $gte: fromDate } }
                        ]
                    }
                ]
            }
        ]
    }];
    if (visibilityQuery && Object.keys(visibilityQuery).length > 0) {
        queryAnd.push(visibilityQuery);
    }
    if (queryAnd.length > 0) {
        query.$and = queryAnd;
    }

    const rows = await CalendarEvent.find(query)
        .sort({ startAt: 1, createdAt: 1 })
        .limit(MAX_QUERY_BASE_EVENTS)
        .lean();
    const expandedRows = sortCalendarEventsByStartAt(rows.flatMap((event) => expandCalendarEventForUpcoming(event, {
        fromDate,
        maxOccurrences: MAX_UPCOMING_OCCURRENCES_PER_EVENT
    })));
    const limitedRows = expandedRows.slice(0, limit);

    return {
        items: limitedRows.map(mapCalendarEvent),
        from: fromDate.toISOString()
    };
};

const toAudienceUserOption = (user) => {
    const firstName = String(user?.firstName || '').trim();
    const lastName = String(user?.lastName || '').trim();
    const email = String(user?.email || '').trim().toLowerCase();
    const name = `${firstName} ${lastName}`.trim() || email || 'User';
    return {
        id: toId(user?._id),
        firstName,
        lastName,
        name,
        email,
        role: String(user?.role || '').trim(),
        label: email ? `${name} (${email})` : name
    };
};

export const searchCalendarAudienceUsers = async ({
    schoolId,
    user,
    filters = {}
}) => {
    ensureManagePermission(user);

    const limit = Math.min(50, Math.max(1, Number.parseInt(filters.limit, 10) || 20));
    const search = String(filters.search || '').trim();
    const query = {
        school: schoolId,
        isActive: true,
        role: { $ne: 'super_admin' }
    };

    if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        const terms = search.split(/\s+/).filter(Boolean);
        query.$or = [
            { firstName: regex },
            { lastName: regex },
            { email: regex },
            ...(terms.length >= 2
                ? [{
                    $and: [
                        { firstName: new RegExp(escapeRegex(terms[0]), 'i') },
                        { lastName: new RegExp(escapeRegex(terms.slice(1).join(' ')), 'i') }
                    ]
                }]
                : [])
        ];
    }

    const rows = await User.find(query)
        .select('_id firstName lastName email role')
        .sort({ firstName: 1, lastName: 1, email: 1 })
        .limit(limit)
        .lean();

    return {
        users: rows.map(toAudienceUserOption)
    };
};

export const getCalendarNotificationPreferences = async ({ schoolId, userId }) => {
    const preference = await CalendarNotificationPreference.findOne({
        school: schoolId,
        user: userId
    }).lean();
    return mapNotificationPreference(preference);
};

export const updateCalendarNotificationPreferences = async ({
    schoolId,
    userId,
    payload = {}
}) => {
    const update = {};
    const rawEnabled = payload.enabled;
    const rawCategories = payload.categoriesEnabled;
    const rawMutedEventIds = payload.mutedEventIds;
    const eventId = toId(payload.eventId).trim();
    const hasEventToggle = Boolean(eventId);
    const eventEnabled = payload.eventEnabled;

    if (typeof rawEnabled === 'boolean') {
        update.enabled = rawEnabled;
    }
    if (Array.isArray(rawCategories)) {
        update.categoriesEnabled = parseCalendarCategories(rawCategories);
    }
    if (Array.isArray(rawMutedEventIds)) {
        update.mutedEventIds = normalizeObjectIdArray(rawMutedEventIds);
    }

    let preference = await CalendarNotificationPreference.findOne({
        school: schoolId,
        user: userId
    });

    if (!preference) {
        preference = await CalendarNotificationPreference.create({
            school: schoolId,
            user: userId
        });
    }

    if (Object.keys(update).length > 0) {
        Object.assign(preference, update);
    }

    if (hasEventToggle) {
        if (typeof eventEnabled !== 'boolean') {
            throw buildHttpError(400, 'eventEnabled must be boolean when eventId is provided');
        }

        if (!mongoose.Types.ObjectId.isValid(eventId)) {
            throw buildHttpError(400, 'eventId must be a valid Mongo ID');
        }

        const eventExists = await CalendarEvent.exists({ _id: eventId, school: schoolId });
        if (!eventExists) {
            throw buildHttpError(404, 'Calendar event not found for this school');
        }

        const muted = new Set((preference.mutedEventIds || []).map((id) => toId(id)));
        if (eventEnabled) {
            muted.delete(eventId);
        } else {
            muted.add(eventId);
        }
        preference.mutedEventIds = [...muted];
    }

    await preference.save();
    return mapNotificationPreference(preference.toObject());
};
