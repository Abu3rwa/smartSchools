import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentAcademicYear } from '../../../../../store/slices/uiSlice';
import readingService from '../../../../../services/readingService';

const REFRESH_INTERVAL_MS = 60_000;

const lockedMap = (chapters) => new Map(
  (chapters || []).map((chapter) => [String(chapter._id), Boolean(chapter.locked)])
);

/**
 * Loads the student's reading book and keeps it fresh while the page is open, so a
 * chapter the teacher publishes appears without a reload.
 */
export function useReadingBookData({ onChapterUnlocked } = {}) {
  const academicYear = useSelector(selectCurrentAcademicYear);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const previousLocked = useRef(null);
  const inFlight = useRef(false);
  const unlockedHandler = useRef(onChapterUnlocked);
  unlockedHandler.current = onChapterUnlocked;

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await readingService.getBook();
      const next = res.data?.data?.chapters || [];
      const nextLocked = lockedMap(next);
      if (previousLocked.current) {
        const opened = next
          .filter((chapter) => previousLocked.current.get(String(chapter._id)) === true && !chapter.locked)
          .map((chapter) => chapter._id);
        if (opened.length) unlockedHandler.current?.(opened);
      }
      previousLocked.current = nextLocked;
      setChapters(next);
      setError(null);
    } catch (err) {
      if (!silent) setError(err);
    } finally {
      inFlight.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setChapters([]);
    previousLocked.current = null;
    refresh();
  }, [refresh, academicYear]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refresh({ silent: true });
    };
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    const timer = setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    return () => {
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      clearInterval(timer);
    };
  }, [refresh]);

  return { chapters, academicYear, loading, error, refresh };
}
