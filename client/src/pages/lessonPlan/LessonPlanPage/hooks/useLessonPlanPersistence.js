import { useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../../../store/slices/authSlice.js';
import { 
  saveLessonPlanDraft, 
  getLessonPlanDraft, 
  clearLessonPlanDraft 
} from '../../../../../utils/lessonPlanPersistence.js';

/**
 * Custom hook to manage lesson plan form persistence in LocalStorage.
 * Automatically saves changes (debounced) and provides methods to load/clear drafts.
 */
const useLessonPlanPersistence = (lessonId, formData) => {
  const user = useSelector(selectUser);
  const schoolId = user?.school?._id || user?.school;
  const userId = user?._id;
  
  const timerRef = useRef(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /**
   * Save draft with debounce to avoid excessive LocalStorage writes
   */
  useEffect(() => {
    // Only auto-save if we have the minimum context
    if (!schoolId || !userId || !formData) return;

    // Debounce logic
    if (timerRef.current) clearTimeout(timerRef.current);
    
    timerRef.current = setTimeout(() => {
      // Don't save binary files to LocalStorage
      const { materialFile, ...persistableData } = formData;
      
      // Only save if there's actual content (e.g. title or some fields filled)
      const hasContent = persistableData.title || 
                         persistableData.summary || 
                         persistableData.description ||
                         persistableData.contextText;

      if (hasContent) {
        saveLessonPlanDraft(schoolId, userId, lessonId || 'new', persistableData);
      }
    }, 1000); // 1 second debounce

  }, [formData, lessonId, schoolId, userId]);

  /**
   * Manually load a draft
   */
  const loadDraft = useCallback(() => {
    if (!schoolId || !userId) return null;
    const draft = getLessonPlanDraft(schoolId, userId, lessonId || 'new');
    return draft ? draft.data : null;
  }, [schoolId, userId, lessonId]);

  /**
   * Check if a draft exists and is newer than the lesson itself
   * @param {Date|string} updatedAt - The lesson's last updated time from server
   */
  const getAvailableDraft = useCallback((updatedAt) => {
    if (!schoolId || !userId) return null;
    const draft = getLessonPlanDraft(schoolId, userId, lessonId || 'new');
    if (!draft) return null;

    if (updatedAt) {
      const serverTime = new Date(updatedAt).getTime();
      // Only suggest draft if it's newer than server data
      if (draft.timestamp <= serverTime) return null;
    }

    return draft;
  }, [schoolId, userId, lessonId]);

  /**
   * Manually clear the draft
   */
  const clear = useCallback(() => {
    if (!schoolId || !userId) return;
    clearLessonPlanDraft(schoolId, userId, lessonId || 'new');
  }, [schoolId, userId, lessonId]);

  return {
    loadDraft,
    getAvailableDraft,
    clear,
  };
};

export default useLessonPlanPersistence;
