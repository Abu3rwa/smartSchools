const OBJECTIVE_TEXT_MAX_LENGTH = 160;
const PREAMBLE_PATTERNS = [
    /^By the end of (?:this lesson|the lesson)[,:]?\s*(?:students will be able to[,:]?)?\s*/i,
    /^(?:Students will be able to|Learners will)[,:]?\s*/i,
    /^Learning objectives?[,:]?\s*/i,
    /^Objectives?(?:\s*\(\d+\))?[,:]?\s*/i,
];

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (value?._id) return String(value._id).trim();
    return String(value).trim();
};

const normalizeWhitespace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const clipObjectiveText = (value = '', maxLength = OBJECTIVE_TEXT_MAX_LENGTH) => {
    const normalized = normalizeWhitespace(value);
    if (!normalized) return '';
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trim()}...`;
};

const simpleHash = (value = '') => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
};

const slugify = (value = '') => normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

const buildObjectiveKey = (text, order) => {
    const base = slugify(text) || `objective-${order + 1}`;
    return `obj_${base}_${simpleHash(text).slice(0, 6)}`;
};

const splitLegacyObjectives = (value = '') => {
    const stripPreamble = (input = '') => {
        let next = String(input || '').trim();
        for (const pattern of PREAMBLE_PATTERNS) {
            next = next.replace(pattern, '').trim();
        }
        return next;
    };

    const normalized = stripPreamble(String(value || '').replace(/\r\n?/g, '\n'));
    const chunks = normalized
        .split('\n')
        .map((line) => line
            .replace(/^\s*[\u2022•\-*]\s+/, '')
            .replace(/^\s*\d+[.)]\s+/, ''))
        .map((line) => stripPreamble(line))
        .flatMap((line) => String(line || '').split(/\s*;\s*/))
        .map((item) => normalizeWhitespace(item))
        .filter(Boolean);

    if (chunks.length > 0) return chunks;

    const single = normalizeWhitespace(value);
    return single ? [single] : [];
};

export const normalizeLessonObjectives = ({
    objectives = [],
    teachingObjectives = '',
    standardIds = []
} = {}) => {
    const fallbackStandardIds = Array.isArray(standardIds)
        ? standardIds.map(toIdString).filter(Boolean)
        : [];

    const sourceObjectives = Array.isArray(objectives) && objectives.length > 0
        ? objectives
        : splitLegacyObjectives(teachingObjectives).map((text, index) => ({
            text,
            order: index,
            standardIds: fallbackStandardIds
        }));

    const seen = new Set();
    const normalized = [];

    sourceObjectives.forEach((objective, index) => {
        const text = clipObjectiveText(objective?.text || objective || '');
        if (!text) return;

        const key = normalizeWhitespace(objective?.objectiveKey || '') || buildObjectiveKey(text, index);
        if (seen.has(key)) return;
        seen.add(key);

        const normalizedStandardIds = Array.isArray(objective?.standardIds)
            ? objective.standardIds.map(toIdString).filter(Boolean)
            : fallbackStandardIds;

        normalized.push({
            objectiveKey: key,
            text,
            standardIds: [...new Set(normalizedStandardIds)],
            order: Number.isFinite(Number(objective?.order)) ? Number(objective.order) : normalized.length
        });
    });

    return normalized;
};

export const resolveLessonObjectives = (lesson = {}) => normalizeLessonObjectives({
    objectives: lesson?.objectives,
    teachingObjectives: lesson?.teachingObjectives,
    standardIds: lesson?.standardIds
});

export { clipObjectiveText };