/**
 * The platform owner's Inbox Assistant limits. One row, not tenant-scoped: the
 * caps apply to every school and are read on each scan and draft.
 */
import AiCreditSetting from '../models/AiCreditSetting.js';

const KEY = 'default';
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

export const INBOX_DEFAULTS = Object.freeze({
    enabled: true,
    defaultScanSize: 25,
    maxScanSize: 50,
    maxScansPerDay: 20,
    maxDraftsPerDay: 100,
    freeScansPerDay: 0,
    rawTextRetentionDays: 14,
    // Off until the owner enables the Calendar API and finishes Google verification.
    calendarEnabled: false,
    autoAddCapPerScan: 10
});

const NUMBER_FIELDS = [
    ['defaultScanSize', 10, 50, 'default scan size'],
    ['maxScanSize', 10, 100, 'largest scan size'],
    ['maxScansPerDay', 1, 200, 'scans per day'],
    ['maxDraftsPerDay', 1, 1000, 'drafts per day'],
    ['freeScansPerDay', 0, 50, 'free scans per day'],
    ['rawTextRetentionDays', 1, 90, 'days the email text is kept'],
    ['autoAddCapPerScan', 1, 50, 'automatic calendar adds per scan']
];

const BOOLEAN_FIELDS = [
    ['enabled', 'Inbox Assistant'],
    ['calendarEnabled', 'Google Calendar']
];

export const readInboxSettings = async () => {
    const setting = await AiCreditSetting.findOne({ key: KEY }).select('inbox').lean();
    return { ...INBOX_DEFAULTS, ...(setting?.inbox || {}) };
};

export const getPlatformInboxSettings = async () => readInboxSettings();

export const saveInboxSettings = async ({ patch = {}, updatedBy } = {}) => {
    const next = { ...await readInboxSettings() };

    for (const [field, label] of BOOLEAN_FIELDS) {
        if (patch[field] === undefined) continue;
        if (typeof patch[field] !== 'boolean') {
            throw badRequest(`Turn ${label} on or off.`);
        }
        next[field] = patch[field];
    }
    for (const [field, min, max, label] of NUMBER_FIELDS) {
        if (patch[field] === undefined) continue;
        const value = Number(patch[field]);
        if (!Number.isInteger(value) || value < min || value > max) {
            throw badRequest(`The ${label} must be a whole number from ${min} to ${max}.`);
        }
        next[field] = value;
    }
    if (next.defaultScanSize > next.maxScanSize) {
        throw badRequest('The default scan size cannot be larger than the largest scan size.');
    }

    await AiCreditSetting.findOneAndUpdate(
        { key: KEY },
        { $set: { inbox: next, updatedBy } },
        { upsert: true, setDefaultsOnInsert: true }
    );
    return next;
};
