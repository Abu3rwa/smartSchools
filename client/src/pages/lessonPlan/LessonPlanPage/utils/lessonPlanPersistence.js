/**
 * Utility for persisting lesson plan drafts to LocalStorage.
 * Drafts are keyed by school, teacher, and lesson ID to avoid collisions.
 */

const PREFIX = 'lp_draft';
const EXPIRY_DAYS = 7;

/**
 * Get unique storage key for a specific lesson draft
 */
const getStorageKey = (schoolId, userId, lessonId = 'new') => {
  if (!schoolId || !userId) return null;
  return `${PREFIX}_${schoolId}_${userId}_${lessonId}`;
};

/**
 * Save a lesson plan draft
 */
export const saveLessonPlanDraft = (schoolId, userId, lessonId, data) => {
  const key = getStorageKey(schoolId, userId, lessonId);
  if (!key) return;

  const draft = {
    data,
    timestamp: Date.now(),
    version: '1.0', // For future schema migrations
  };

  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (error) {
    console.warn('Failed to save lesson plan draft to LocalStorage', error);
  }
};

/**
 * Retrieve a lesson plan draft
 */
export const getLessonPlanDraft = (schoolId, userId, lessonId) => {
  const key = getStorageKey(schoolId, userId, lessonId);
  if (!key) return null;

  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const draft = JSON.parse(raw);
    
    // Check for expiry
    const ageInDays = (Date.now() - draft.timestamp) / (1000 * 60 * 60 * 24);
    if (ageInDays > EXPIRY_DAYS) {
      localStorage.removeItem(key);
      return null;
    }

    return draft;
  } catch (error) {
    console.warn('Failed to parse lesson plan draft from LocalStorage', error);
    return null;
  }
};

/**
 * Clear a specific lesson plan draft
 */
export const clearLessonPlanDraft = (schoolId, userId, lessonId) => {
  const key = getStorageKey(schoolId, userId, lessonId);
  if (key) {
    localStorage.removeItem(key);
  }
};

/**
 * Clear all lesson plan drafts for a specific user
 */
export const clearAllUserDrafts = (schoolId, userId) => {
  if (!schoolId || !userId) return;
  const userPrefix = `${PREFIX}_${schoolId}_${userId}_`;
  
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(userPrefix)) {
      localStorage.removeItem(key);
    }
  });
};
