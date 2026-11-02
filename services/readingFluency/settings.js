/**
 * The `fluency` block on a reading assignment. Kept separate from the service
 * so assignment creation and the settings endpoint validate the same way.
 */
export const DEFAULT_FLUENCY_SETTINGS = Object.freeze({
    enabled: false,
    parts: [],
    minReadings: 3,
    maxReadingsPerPart: 6,
    targetAccuracy: 95,
    targetWpm: null,
    showPace: true,
    requireListenFirst: false
});

export const FLUENCY_LIMITS = Object.freeze({
    minReadings: { min: 1, max: 10 },
    maxReadingsPerPart: { min: 1, max: 20 },
    targetAccuracy: { min: 0, max: 100 },
    targetWpm: { min: 0, max: 400 }
});

const badRequest = (message) => Object.assign(new Error(message), {
    statusCode: 400,
    code: 'FLUENCY_SETTINGS_INVALID'
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const readRaw = (value) => (typeof value?.toObject === 'function' ? value.toObject() : (value || {}));

const cleanParts = (parts) => {
    if (!Array.isArray(parts)) throw badRequest('Parts must be a list.');
    const seen = new Set();
    const cleaned = [];
    for (const part of parts) {
        const key = String(part?.key || '').trim();
        if (!key || seen.has(key)) continue;
        const level = part?.level === null || part?.level === undefined || part?.level === ''
            ? null
            : Number(part.level);
        if (level !== null && (!Number.isInteger(level) || level < 1 || level > 20)) {
            throw badRequest('Each part level must be a whole number between 1 and 20.');
        }
        seen.add(key);
        cleaned.push({ key, level });
    }
    return cleaned;
};

const wholeNumber = (value, limits, label) => {
    const number = Number(value);
    if (!Number.isFinite(number) || !Number.isInteger(number)) {
        throw badRequest(`${label} must be a whole number.`);
    }
    return clamp(number, limits.min, limits.max);
};

const optionalWhole = (value, limits, label) => {
    if (value === null || value === undefined || value === '') return null;
    return wholeNumber(value, limits, label);
};

const boolean = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

/** Full, validated settings. Missing fields take their defaults. */
export const sanitizeFluencySettings = (input = {}) => {
    const raw = readRaw(input);
    const enabled = boolean(raw.enabled, false);
    const parts = cleanParts(raw.parts ?? []);
    const minReadings = wholeNumber(raw.minReadings ?? DEFAULT_FLUENCY_SETTINGS.minReadings, FLUENCY_LIMITS.minReadings, 'Minimum readings');
    const maxReadingsPerPart = wholeNumber(
        raw.maxReadingsPerPart ?? DEFAULT_FLUENCY_SETTINGS.maxReadingsPerPart,
        FLUENCY_LIMITS.maxReadingsPerPart,
        'Most readings'
    );
    if (maxReadingsPerPart < minReadings) {
        throw badRequest('The most readings cannot be lower than the minimum readings.');
    }
    const settings = {
        enabled,
        parts,
        minReadings,
        maxReadingsPerPart,
        targetAccuracy: wholeNumber(
            raw.targetAccuracy ?? DEFAULT_FLUENCY_SETTINGS.targetAccuracy,
            FLUENCY_LIMITS.targetAccuracy,
            'Target accuracy'
        ),
        targetWpm: optionalWhole(raw.targetWpm, FLUENCY_LIMITS.targetWpm, 'Target pace'),
        showPace: boolean(raw.showPace, DEFAULT_FLUENCY_SETTINGS.showPace),
        requireListenFirst: boolean(raw.requireListenFirst, DEFAULT_FLUENCY_SETTINGS.requireListenFirst)
    };
    if (enabled && settings.parts.length === 0) {
        throw badRequest('Choose at least one part for reading aloud practice.');
    }
    return settings;
};

/** Existing documents may predate the block, so every read goes through this. */
export const mergeFluencySettings = (value) => {
    try {
        return sanitizeFluencySettings({ ...DEFAULT_FLUENCY_SETTINGS, ...readRaw(value) });
    } catch {
        return { ...DEFAULT_FLUENCY_SETTINGS, parts: [] };
    }
};

export const mergeSettingsPatch = (existing, patch = {}) => sanitizeFluencySettings({
    ...mergeFluencySettings(existing),
    ...readRaw(patch)
});

export const partByKey = (settings, blockKey) => (settings?.parts || [])
    .find((part) => part.key === blockKey) || null;

/** V1 scores English texts only; the UI hides the feature elsewhere. */
export const isEnglishLanguage = (language) => {
    const value = String(language || '').trim().toLocaleLowerCase();
    return !value || value === 'en' || value === 'english';
};
