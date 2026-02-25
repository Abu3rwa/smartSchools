import { body, param, query } from 'express-validator';
import {
    CALENDAR_EVENT_CATEGORIES,
    CALENDAR_EVENT_RECURRENCE_FREQUENCIES,
    CALENDAR_EVENT_STATUSES,
    CALENDAR_EVENT_VISIBILITIES
} from '../models/CalendarEvent.js';

const validateCategoryList = (rawValue) => {
    if (rawValue == null || rawValue === '') return true;
    const values = Array.isArray(rawValue) ? rawValue : String(rawValue).split(',');
    const normalized = values
        .map((value) => String(value || '').trim().toUpperCase())
        .filter(Boolean);
    if (normalized.length === 0) return true;
    if (normalized.includes('ALL')) return true;
    return normalized.every((value) => CALENDAR_EVENT_CATEGORIES.includes(value));
};

const validateDateOrdering = ({ startAt, endAt }) => {
    if (!startAt || !endAt) return true;
    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return false;
    return endDate >= startDate;
};

const normalizeWeekdayList = (values = []) => {
    if (!Array.isArray(values)) return [];
    const set = new Set();
    values.forEach((value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
            set.add(parsed);
        }
    });
    return [...set];
};

const normalizeEmailList = (values = []) => {
    if (!Array.isArray(values)) return [];
    return values
        .map((value) => String(value || '').trim().toLowerCase())
        .filter((value) => value.length > 0);
};

const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;

const validateRecurrencePayload = (value = {}, { partial = false } = {}) => {
    if (value == null) return true;
    if (typeof value !== 'object' || Array.isArray(value)) return false;

    const recurrence = value.recurrence;
    if (!partial && recurrence == null) return true;
    if (recurrence == null) return true;
    if (typeof recurrence !== 'object' || Array.isArray(recurrence)) return false;

    const isRecurring = recurrence.isRecurring === true;
    if (!isRecurring) return true;

    const frequency = String(recurrence.frequency || '').trim().toUpperCase();
    if (!CALENDAR_EVENT_RECURRENCE_FREQUENCIES.includes(frequency)) return false;

    const interval = Number.parseInt(recurrence.interval, 10);
    if (!Number.isInteger(interval) || interval < 1 || interval > 52) return false;

    if (frequency === 'WEEKLY') {
        const weekDays = normalizeWeekdayList(recurrence.weekDays);
        if (weekDays.length === 0) return false;
    }

    if (recurrence.until != null) {
        const until = new Date(recurrence.until);
        if (Number.isNaN(until.getTime())) return false;
        if (value.startAt) {
            const startAt = new Date(value.startAt);
            if (!Number.isNaN(startAt.getTime()) && until < startAt) {
                return false;
            }
        }
    }

    return true;
};

const validateCustomAudiencePayload = (value = {}, { partial = false } = {}) => {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return true;
    const audience = value.audience;
    if (audience == null) return true;
    if (typeof audience !== 'object' || Array.isArray(audience)) return false;

    const visibility = String(audience.visibility || '').trim().toUpperCase();
    const hasAudienceField = ['userIds', 'emails', 'teacherIds', 'classIds', 'gradeIds']
        .some((key) => Object.prototype.hasOwnProperty.call(audience, key));
    if (partial && visibility !== 'CUSTOM' && !hasAudienceField) return true;
    if (visibility !== 'CUSTOM') return true;

    const emailList = normalizeEmailList(audience.emails);
    const emailValid = emailList.every((email) => EMAIL_REGEX.test(email));
    if (!emailValid) return false;

    const userIds = Array.isArray(audience.userIds) ? audience.userIds : [];
    const teacherIds = Array.isArray(audience.teacherIds) ? audience.teacherIds : [];
    const classIds = Array.isArray(audience.classIds) ? audience.classIds : [];
    const gradeIds = Array.isArray(audience.gradeIds) ? audience.gradeIds : [];

    return (
        emailList.length > 0
        || userIds.length > 0
        || teacherIds.length > 0
        || classIds.length > 0
        || gradeIds.length > 0
    );
};

export const calendarEventIdParam = [
    param('id').isMongoId().withMessage('Invalid event id format')
];

export const createCalendarEventRules = [
    body('title')
        .isString()
        .trim()
        .notEmpty()
        .isLength({ max: 160 })
        .withMessage('title is required and must be at most 160 characters'),
    body('description')
        .optional()
        .isString()
        .trim()
        .isLength({ max: 2000 })
        .withMessage('description must be at most 2000 characters'),
    body('category')
        .isString()
        .trim()
        .custom((value) => CALENDAR_EVENT_CATEGORIES.includes(String(value || '').trim().toUpperCase()))
        .withMessage(`category must be one of: ${CALENDAR_EVENT_CATEGORIES.join(', ')}`),
    body('startAt').isISO8601().withMessage('startAt must be a valid ISO date'),
    body('endAt').isISO8601().withMessage('endAt must be a valid ISO date'),
    body('allDay').optional().isBoolean().withMessage('allDay must be a boolean'),
    body('location')
        .optional()
        .isString()
        .trim()
        .isLength({ max: 220 })
        .withMessage('location must be at most 220 characters'),
    body('audience').optional().isObject().withMessage('audience must be an object'),
    body('audience.visibility')
        .optional()
        .isString()
        .trim()
        .custom((value) => CALENDAR_EVENT_VISIBILITIES.includes(String(value || '').trim().toUpperCase()))
        .withMessage(`audience.visibility must be one of: ${CALENDAR_EVENT_VISIBILITIES.join(', ')}`),
    body('audience.userIds').optional().isArray().withMessage('audience.userIds must be an array'),
    body('audience.userIds.*').optional().isMongoId().withMessage('audience.userIds must contain valid IDs'),
    body('audience.emails').optional().isArray().withMessage('audience.emails must be an array'),
    body('audience.emails.*')
        .optional()
        .isEmail()
        .withMessage('audience.emails must contain valid emails'),
    body('audience.teacherIds').optional().isArray().withMessage('audience.teacherIds must be an array'),
    body('audience.teacherIds.*').optional().isMongoId().withMessage('audience.teacherIds must contain valid IDs'),
    body('audience.classIds').optional().isArray().withMessage('audience.classIds must be an array'),
    body('audience.classIds.*').optional().isMongoId().withMessage('audience.classIds must contain valid IDs'),
    body('audience.gradeIds').optional().isArray().withMessage('audience.gradeIds must be an array'),
    body('audience.gradeIds.*')
        .optional()
        .isInt({ min: 1, max: 12 })
        .withMessage('audience.gradeIds must contain values between 1 and 12'),
    body('recurrence').optional().isObject().withMessage('recurrence must be an object'),
    body('recurrence.isRecurring').optional().isBoolean().withMessage('recurrence.isRecurring must be a boolean'),
    body('recurrence.frequency')
        .optional()
        .isString()
        .trim()
        .custom((value) => CALENDAR_EVENT_RECURRENCE_FREQUENCIES.includes(String(value || '').trim().toUpperCase()))
        .withMessage(`recurrence.frequency must be one of: ${CALENDAR_EVENT_RECURRENCE_FREQUENCIES.join(', ')}`),
    body('recurrence.interval')
        .optional()
        .isInt({ min: 1, max: 52 })
        .withMessage('recurrence.interval must be between 1 and 52'),
    body('recurrence.weekDays').optional().isArray().withMessage('recurrence.weekDays must be an array'),
    body('recurrence.weekDays.*')
        .optional()
        .isInt({ min: 0, max: 6 })
        .withMessage('recurrence.weekDays must contain values between 0 (Sun) and 6 (Sat)'),
    body('recurrence.until')
        .optional({ nullable: true })
        .isISO8601()
        .withMessage('recurrence.until must be a valid ISO date'),
    body()
        .custom((value) => validateDateOrdering(value))
        .withMessage('endAt must be greater than or equal to startAt'),
    body()
        .custom((value) => validateCustomAudiencePayload(value))
        .withMessage('CUSTOM audience requires at least one recipient target (email, user, teacher, class, or grade)'),
    body()
        .custom((value) => validateRecurrencePayload(value))
        .withMessage('Invalid recurrence configuration')
];

export const updateCalendarEventRules = [
    ...calendarEventIdParam,
    body().custom((value, { req }) => {
        const updatableFields = [
            'title',
            'description',
            'category',
            'startAt',
            'endAt',
            'allDay',
            'location',
            'audience',
            'recurrence',
            'status'
        ];
        const hasUpdatableField = updatableFields.some((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field));
        if (!hasUpdatableField) {
            throw new Error(`At least one of [${updatableFields.join(', ')}] is required`);
        }
        return true;
    }),
    body('title')
        .optional()
        .isString()
        .trim()
        .notEmpty()
        .isLength({ max: 160 })
        .withMessage('title must be at most 160 characters'),
    body('description')
        .optional()
        .isString()
        .trim()
        .isLength({ max: 2000 })
        .withMessage('description must be at most 2000 characters'),
    body('category')
        .optional()
        .isString()
        .trim()
        .custom((value) => CALENDAR_EVENT_CATEGORIES.includes(String(value || '').trim().toUpperCase()))
        .withMessage(`category must be one of: ${CALENDAR_EVENT_CATEGORIES.join(', ')}`),
    body('status')
        .optional()
        .isString()
        .trim()
        .custom((value) => CALENDAR_EVENT_STATUSES.includes(String(value || '').trim().toUpperCase()))
        .withMessage(`status must be one of: ${CALENDAR_EVENT_STATUSES.join(', ')}`),
    body('startAt').optional().isISO8601().withMessage('startAt must be a valid ISO date'),
    body('endAt').optional().isISO8601().withMessage('endAt must be a valid ISO date'),
    body('allDay').optional().isBoolean().withMessage('allDay must be a boolean'),
    body('location')
        .optional()
        .isString()
        .trim()
        .isLength({ max: 220 })
        .withMessage('location must be at most 220 characters'),
    body('audience').optional().isObject().withMessage('audience must be an object'),
    body('audience.visibility')
        .optional()
        .isString()
        .trim()
        .custom((value) => CALENDAR_EVENT_VISIBILITIES.includes(String(value || '').trim().toUpperCase()))
        .withMessage(`audience.visibility must be one of: ${CALENDAR_EVENT_VISIBILITIES.join(', ')}`),
    body('audience.userIds').optional().isArray().withMessage('audience.userIds must be an array'),
    body('audience.userIds.*').optional().isMongoId().withMessage('audience.userIds must contain valid IDs'),
    body('audience.emails').optional().isArray().withMessage('audience.emails must be an array'),
    body('audience.emails.*')
        .optional()
        .isEmail()
        .withMessage('audience.emails must contain valid emails'),
    body('audience.teacherIds').optional().isArray().withMessage('audience.teacherIds must be an array'),
    body('audience.teacherIds.*').optional().isMongoId().withMessage('audience.teacherIds must contain valid IDs'),
    body('audience.classIds').optional().isArray().withMessage('audience.classIds must be an array'),
    body('audience.classIds.*').optional().isMongoId().withMessage('audience.classIds must contain valid IDs'),
    body('audience.gradeIds').optional().isArray().withMessage('audience.gradeIds must be an array'),
    body('audience.gradeIds.*')
        .optional()
        .isInt({ min: 1, max: 12 })
        .withMessage('audience.gradeIds must contain values between 1 and 12'),
    body('recurrence').optional().isObject().withMessage('recurrence must be an object'),
    body('recurrence.isRecurring').optional().isBoolean().withMessage('recurrence.isRecurring must be a boolean'),
    body('recurrence.frequency')
        .optional()
        .isString()
        .trim()
        .custom((value) => CALENDAR_EVENT_RECURRENCE_FREQUENCIES.includes(String(value || '').trim().toUpperCase()))
        .withMessage(`recurrence.frequency must be one of: ${CALENDAR_EVENT_RECURRENCE_FREQUENCIES.join(', ')}`),
    body('recurrence.interval')
        .optional()
        .isInt({ min: 1, max: 52 })
        .withMessage('recurrence.interval must be between 1 and 52'),
    body('recurrence.weekDays').optional().isArray().withMessage('recurrence.weekDays must be an array'),
    body('recurrence.weekDays.*')
        .optional()
        .isInt({ min: 0, max: 6 })
        .withMessage('recurrence.weekDays must contain values between 0 (Sun) and 6 (Sat)'),
    body('recurrence.until')
        .optional({ nullable: true })
        .isISO8601()
        .withMessage('recurrence.until must be a valid ISO date'),
    body().custom((value) => {
        const hasDateOrdering = validateDateOrdering(value);
        if (!hasDateOrdering) {
            throw new Error('endAt must be greater than or equal to startAt');
        }
        if (!validateCustomAudiencePayload(value, { partial: true })) {
            throw new Error('CUSTOM audience requires at least one recipient target (email, user, teacher, class, or grade)');
        }
        if (!validateRecurrencePayload(value, { partial: true })) {
            throw new Error('Invalid recurrence configuration');
        }
        return true;
    })
];

export const listCalendarEventsRules = [
    query('from').optional().isISO8601().withMessage('from must be a valid ISO date'),
    query('to').optional().isISO8601().withMessage('to must be a valid ISO date'),
    query('status')
        .optional()
        .isString()
        .trim()
        .custom((value) => CALENDAR_EVENT_STATUSES.includes(String(value || '').trim().toUpperCase()))
        .withMessage(`status must be one of: ${CALENDAR_EVENT_STATUSES.join(', ')}`),
    query('category')
        .optional()
        .custom(validateCategoryList)
        .withMessage(`category must be one or more of: ${CALENDAR_EVENT_CATEGORIES.join(', ')}`),
    query('search')
        .optional()
        .isString()
        .trim()
        .isLength({ max: 120 })
        .withMessage('search must be at most 120 characters'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
    query().custom((value) => {
        if (!value?.from || !value?.to) return true;
        const fromDate = new Date(value.from);
        const toDate = new Date(value.to);
        if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return false;
        return fromDate <= toDate;
    }).withMessage('from must be before or equal to to')
];

export const upcomingCalendarEventsRules = [
    query('from').optional().isISO8601().withMessage('from must be a valid ISO date'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be between 1 and 50'),
    query('category')
        .optional()
        .custom(validateCategoryList)
        .withMessage(`category must be one or more of: ${CALENDAR_EVENT_CATEGORIES.join(', ')}`)
];

export const searchCalendarAudienceUsersRules = [
    query('search')
        .optional()
        .isString()
        .trim()
        .isLength({ max: 120 })
        .withMessage('search must be at most 120 characters'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('limit must be between 1 and 50')
];

export const updateCalendarNotificationPreferencesRules = [
    body('enabled').optional().isBoolean().withMessage('enabled must be boolean'),
    body('categoriesEnabled').optional().isArray().withMessage('categoriesEnabled must be an array'),
    body('categoriesEnabled.*')
        .optional()
        .isString()
        .trim()
        .custom((value) => CALENDAR_EVENT_CATEGORIES.includes(String(value || '').trim().toUpperCase()))
        .withMessage(`categoriesEnabled must contain values in: ${CALENDAR_EVENT_CATEGORIES.join(', ')}`),
    body('mutedEventIds').optional().isArray().withMessage('mutedEventIds must be an array'),
    body('mutedEventIds.*').optional().isMongoId().withMessage('mutedEventIds must contain valid IDs'),
    body('eventId').optional().isMongoId().withMessage('eventId must be a valid Mongo ID'),
    body('eventEnabled').optional().isBoolean().withMessage('eventEnabled must be boolean'),
    body().custom((value) => {
        if (value?.eventId != null && typeof value?.eventEnabled !== 'boolean') {
            throw new Error('eventEnabled must be boolean when eventId is provided');
        }
        return true;
    })
];
