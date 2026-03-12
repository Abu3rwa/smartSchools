export const MAX_BROADCAST_RECIPIENTS = 1500;
export const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

const BOOLEAN_TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

export const toId = (value) => (value == null ? '' : String(value));

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const normalizeObjectIdArray = (values) => {
    if (!Array.isArray(values)) {
        return [];
    }

    const deduped = new Set();
    for (const value of values) {
        const normalized = String(value || '').trim();
        if (!OBJECT_ID_PATTERN.test(normalized)) {
            continue;
        }
        deduped.add(normalized);
    }

    return [...deduped];
};

export const parseBoolean = (raw, fallback = false) => {
    if (typeof raw === 'boolean') {
        return raw;
    }
    if (typeof raw === 'string') {
        return BOOLEAN_TRUE_VALUES.has(raw.trim().toLowerCase());
    }
    return fallback;
};

export const parsePositiveInt = (raw, fallback, max = 100) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.min(parsed, max);
};

export const toDisplayName = (user) => {
    const firstName = user?.firstName || '';
    const lastName = user?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || user?.email || 'User';
};

export const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&');

export const buildClassLabel = (classDoc) => {
    const gradeLabel = Number.isFinite(Number(classDoc?.grade))
        ? `Grade ${classDoc.grade}`
        : '';
    const sectionLabel = (classDoc?.section || '').toString().trim();
    const name = (classDoc?.name || '').toString().trim();

    const parts = [name, gradeLabel, sectionLabel].filter(Boolean);
    if (parts.length === 0) {
        return 'Class';
    }
    return parts.join(' · ');
};
