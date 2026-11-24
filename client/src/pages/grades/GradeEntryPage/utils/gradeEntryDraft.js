export const DRAFT_VERSION = 1;
export const DRAFT_MAX_AGE_DAYS = 7;
export const DRAFT_MAX_BYTES = 250_000;

const DRAFT_PREFIX = 'classhope:gradeEntryDraft:v1';
const INDEX_PREFIX = 'classhope:gradeEntryDrafts:v1';
const MAX_AGE_MS = DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export const draftKey = (userId, classId, subjectId) =>
    `${DRAFT_PREFIX}:${userId || 'anon'}:${classId}:${subjectId}`;

export const indexKey = (userId) => `${INDEX_PREFIX}:${userId || 'anon'}`;

const isExpired = (savedAt, now) => {
    const timestamp = Number(savedAt);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return true;
    return now - timestamp > MAX_AGE_MS;
};

const parseJson = (raw) => {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const byteLength = (value) => {
    if (typeof TextEncoder === 'undefined') return String(value).length;
    return new TextEncoder().encode(String(value)).length;
};

const readIndex = (storage, userId) => {
    const entries = parseJson(storage.getItem(indexKey(userId)));
    if (!Array.isArray(entries)) return [];
    return entries.filter((entry) => entry && entry.classId && entry.subjectId);
};

const writeIndex = (storage, userId, entries) => {
    try {
        storage.setItem(indexKey(userId), JSON.stringify(entries));
        return true;
    } catch {
        return false;
    }
};

export const createDraftStore = (storage) => {
    const now = () => Date.now();

    const describe = (draft) => ({
        classId: String(draft.classId),
        subjectId: String(draft.subjectId),
        classLabel: draft.classLabel || '',
        subjectLabel: draft.subjectLabel || '',
        savedAt: Number(draft.savedAt) || now()
    });

    const upsertIndexEntry = (userId, draft) => {
        const entry = describe(draft);
        const key = draftKey(userId, entry.classId, entry.subjectId);
        const entries = readIndex(storage, userId).filter((item) => (
            draftKey(userId, item.classId, item.subjectId) !== key
        ));
        entries.unshift(entry);
        writeIndex(storage, userId, entries);
    };

    const dropIndexEntry = (userId, classId, subjectId) => {
        const key = draftKey(userId, classId, subjectId);
        const entries = readIndex(storage, userId).filter((item) => (
            draftKey(userId, item.classId, item.subjectId) !== key
        ));
        writeIndex(storage, userId, entries);
    };

    const prune = (userId) => {
        const timestamp = now();
        const entries = readIndex(storage, userId);
        const kept = [];
        for (const entry of entries) {
            if (isExpired(entry.savedAt, timestamp)) {
                storage.removeItem(draftKey(userId, entry.classId, entry.subjectId));
            } else if (storage.getItem(draftKey(userId, entry.classId, entry.subjectId))) {
                kept.push(entry);
            }
        }
        writeIndex(storage, userId, kept);
        return kept;
    };

    const read = (userId, classId, subjectId) => {
        if (!classId || !subjectId) return null;
        const key = draftKey(userId, classId, subjectId);
        const raw = storage.getItem(key);
        if (!raw) return null;
        if (byteLength(raw) > DRAFT_MAX_BYTES) {
            storage.removeItem(key);
            dropIndexEntry(userId, classId, subjectId);
            return null;
        }
        const draft = parseJson(raw);
        if (!draft || draft.v !== DRAFT_VERSION || isExpired(draft.savedAt, now())) {
            storage.removeItem(key);
            dropIndexEntry(userId, classId, subjectId);
            return null;
        }
        return draft;
    };

    const write = (userId, draft) => {
        if (!draft?.classId || !draft?.subjectId) return false;
        const payload = { ...draft, v: DRAFT_VERSION, savedAt: now() };
        let serialized;
        try {
            serialized = JSON.stringify(payload);
        } catch {
            return false;
        }
        if (byteLength(serialized) > DRAFT_MAX_BYTES) return false;
        try {
            storage.setItem(draftKey(userId, payload.classId, payload.subjectId), serialized);
        } catch {
            return false;
        }
        upsertIndexEntry(userId, payload);
        return true;
    };

    const remove = (userId, classId, subjectId) => {
        if (!classId || !subjectId) return;
        try {
            storage.removeItem(draftKey(userId, classId, subjectId));
        } catch { /* storage already unavailable */ }
        dropIndexEntry(userId, classId, subjectId);
    };

    const list = (userId) => prune(userId);

    return { read, write, remove, list, prune };
};

export const hasDraftContent = (draft) => {
    if (!draft) return false;
    const grades = draft.grades || {};
    const hasGrades = Object.values(grades).some((entry) => (
        String(entry?.marks ?? '').trim() !== '' || String(entry?.remarks ?? '').trim() !== ''
    ));
    return hasGrades
        || String(draft.lessonTitle || '').trim() !== ''
        || String(draft.lessonSummary || '').trim() !== ''
        || String(draft.pendingLesson?.title || '').trim() !== ''
        || String(draft.pendingLesson?.summary || '').trim() !== ''
        || String(draft.customCategory || '').trim() !== ''
        || (Array.isArray(draft.lessonPlanIds) && draft.lessonPlanIds.length > 0);
};
