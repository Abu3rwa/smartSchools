import { isMapPracticeAnswerRecorded } from './studentMapPracticeProgress.js';

const DRAFT_KEY_PREFIX = 'mapPracticeDraft:';

const getWindowStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const getMapPracticeDraftKey = (attemptId) => `${DRAFT_KEY_PREFIX}${attemptId}`;

export const readMapPracticeDrafts = (attemptId, storage = getWindowStorage()) => {
  if (!attemptId || !storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(getMapPracticeDraftKey(attemptId)) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
};

export const writeMapPracticeDrafts = (attemptId, drafts = {}, storage = getWindowStorage()) => {
  if (!attemptId || !storage) return;
  try {
    const entries = Object.entries(drafts)
      .filter(([, response]) => isMapPracticeAnswerRecorded(response));
    if (entries.length === 0) {
      storage.removeItem(getMapPracticeDraftKey(attemptId));
      return;
    }
    storage.setItem(getMapPracticeDraftKey(attemptId), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // A full or blocked storage must never break answering.
  }
};

export const clearMapPracticeDrafts = (attemptId, storage = getWindowStorage()) => {
  if (!attemptId || !storage) return;
  try {
    storage.removeItem(getMapPracticeDraftKey(attemptId));
  } catch {
    // ignore
  }
};

export const mergeMapPracticeDrafts = (answers = {}, drafts = {}, questionIds = []) => {
  const allowed = new Set((questionIds || []).map((questionId) => String(questionId)));
  const merged = { ...answers };
  Object.entries(drafts || {}).forEach(([questionId, response]) => {
    if (allowed.has(String(questionId)) && isMapPracticeAnswerRecorded(response)) {
      merged[String(questionId)] = response;
    }
  });
  return merged;
};
