import mongoose from 'mongoose';
import CalendarEvent, {
    CALENDAR_EVENT_CATEGORIES,
    CALENDAR_EVENT_STATUSES
} from '../models/CalendarEvent.js';
import CalendarNotificationPreference from '../models/CalendarNotificationPreference.js';
import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';
import { getTeacherClassIds } from '../helpers/teacherScoping.js';
import { getParentLinkedStudents } from './parentDashboardService.js';
import { PERMISSIONS, hasPermission } from '../config/permissions.js';
import { resolveSchoolAcademicYear } from '../utils/academicYear.js';

const CATEGORY_SET = new Set(CALENDAR_EVENT_CATEGORIES);
const STATUS_SET = new Set(CALENDAR_EVENT_STATUSES);
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

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

const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
};

const normalizeAudience = (input = {}, { partial = false } = {}) => {
    if (input == null) {
        return partial ? undefined : { visibility: 'SCHOOL_WIDE' };
    }
    const audience = typeof input === 'object' ? input : {};
    const normalized = {
        visibility: audience.visibility || 'SCHOOL_WIDE',
        teacherIds: normalizeObjectIdArray(audience.teacherIds),
        classIds: normalizeObjectIdArray(audience.classIds),
        gradeIds: normalizeGradeArray(audience.gradeIds)
    };
    if (!partial) return normalized;

    const hasExplicitKeys = ['visibility', 'teacherIds', 'classIds', 'gradeIds']
        .some((key) => Object.prototype.hasOwnProperty.call(audience, key));
    return hasExplicitKeys ? normalized : undefined;
};

const normalizeCalendarEventPayload = (payload = {}, { partial = false } = {}) => {
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

    if (Object.prototype.hasOwnProperty.call(source, 'status')) {
        const status = String(source.status || '').trim().toUpperCase();
        if (status) normalized.status = status;
    }

    return normalized;
};

const mapCalendarEvent = (event) => {
    if (!event) return null;
    return {
        id: toId(event._id),
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
            teacherIds: (event.audience?.teacherIds || []).map((id) => toId(id)),
            classIds: (event.audience?.classIds || []).map((id) => toId(id)),
            gradeIds: (event.audience?.gradeIds || []).map((value) => Number(value))
        },
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
    const studentClassId = toId(context.studentClassId);
    const studentGradeId = Number(context.studentGradeId);

    if (role === 'teacher') {
        if (visibility === 'TEACHERS_ONLY') return true;
        if (visibility === 'CUSTOM') {
            const teacherIds = (event.audience?.teacherIds || []).map((id) => toId(id));
            const classIds = (event.audience?.classIds || []).map((id) => toId(id));
            return teacherIds.some((id) => teacherAudienceIds.has(id))
                || classIds.some((id) => teacherClassIds.has(id));
        }
        return false;
    }

    if (role === 'parent') {
        if (visibility === 'PARENTS_ONLY') return true;
        if (visibility === 'CUSTOM') {
            const classIds = (event.audience?.classIds || []).map((id) => toId(id));
            const gradeIds = (event.audience?.gradeIds || []).map((value) => Number(value));
            return classIds.some((id) => parentClassIds.has(id))
                || gradeIds.some((value) => parentGradeIds.has(value));
        }
        return false;
    }

    if (role === 'student') {
        if (visibility === 'CUSTOM') {
            const classIds = (event.audience?.classIds || []).map((id) => toId(id));
            const gradeIds = (event.audience?.gradeIds || []).map((value) => Number(value));
            return (studentClassId && classIds.includes(studentClassId))
                || (Number.isInteger(studentGradeId) && gradeIds.includes(studentGradeId));
        }
        return visibility === 'PARENTS_ONLY' ? false : visibility === 'TEACHERS_ONLY' ? false : true;
    }

    if (role === 'staff') {
        return visibility === 'TEACHERS_ONLY';
    }

    return false;
};

const resolveVisibilityContext = async ({ user, schoolId, academicYear }) => {
    const role = getRole(user);
    const context = {
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
    if (role === 'teacher') {
        const teacherAudienceIds = (context.teacherAudienceIds || []).filter(Boolean);
        const teacherClassIds = (context.teacherClassIds || []).filter(Boolean);
        const customConditions = [
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
                { 'audience.visibility': 'TEACHERS_ONLY' }
            ]
        };
    }

    return { 'audience.visibility': 'SCHOOL_WIDE' };
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
        school: schoolId,
        startAt: { $lte: toDate },
        endAt: { $gte: fromDate }
    };

    if (status && STATUS_SET.has(status)) {
        query.status = status;
    }
    if (categories.length > 0) {
        query.category = { $in: categories };
    }

    const normalizedSearch = String(search || '').trim();
    if (normalizedSearch) {
        const regex = new RegExp(escapeRegex(normalizedSearch), 'i');
        query.$or = [{ title: regex }, { description: regex }, { location: regex }];
    }

    if (visibilityQuery && Object.keys(visibilityQuery).length > 0) {
        query.$and = query.$and || [];
        query.$and.push(visibilityQuery);
    }

    return query;
};

export const createCalendarEvent = async ({ schoolId, user, payload }) => {
    ensureManagePermission(user);
    const normalized = normalizeCalendarEventPayload(payload, { partial: false });

    if (!CATEGORY_SET.has(normalized.category)) {
        throw buildHttpError(400, `Invalid category. Allowed: ${CALENDAR_EVENT_CATEGORIES.join(', ')}`);
    }
    if (normalized.endAt < normalized.startAt) {
        throw buildHttpError(400, 'endAt must be greater than or equal to startAt');
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
    const normalized = normalizeCalendarEventPayload(payload, { partial: true });
    if (Object.keys(normalized).length === 0) {
        throw buildHttpError(400, 'At least one field is required to update the event');
    }
    if (normalized.category && !CATEGORY_SET.has(normalized.category)) {
        throw buildHttpError(400, `Invalid category. Allowed: ${CALENDAR_EVENT_CATEGORIES.join(', ')}`);
    }
    if (normalized.status && !STATUS_SET.has(normalized.status)) {
        throw buildHttpError(400, `Invalid status. Allowed: ${CALENDAR_EVENT_STATUSES.join(', ')}`);
    }

    const event = await CalendarEvent.findOne({ _id: eventId, school: schoolId });
    if (!event) {
        throw buildHttpError(404, 'Calendar event not found');
    }

    const nextStartAt = normalized.startAt || event.startAt;
    const nextEndAt = normalized.endAt || event.endAt;
    if (nextEndAt < nextStartAt) {
        throw buildHttpError(400, 'endAt must be greater than or equal to startAt');
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

    const [rows, total] = await Promise.all([
        CalendarEvent.find(query)
            .sort({ startAt: 1, createdAt: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        CalendarEvent.countDocuments(query)
    ]);

    return {
        items: rows.map(mapCalendarEvent),
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
        status: 'ACTIVE',
        startAt: { $gte: fromDate }
    };
    if (categories.length > 0) {
        query.category = { $in: categories };
    }
    if (visibilityQuery && Object.keys(visibilityQuery).length > 0) {
        query.$and = [visibilityQuery];
    }

    const rows = await CalendarEvent.find(query)
        .sort({ startAt: 1, createdAt: 1 })
        .limit(limit)
        .lean();

    return {
        items: rows.map(mapCalendarEvent),
        from: fromDate.toISOString()
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
