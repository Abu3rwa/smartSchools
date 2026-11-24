import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../config/api';
import {
    LESSON_PLAN_DEBOUNCE_MS,
    buildLessonPlanParams
} from './lessonPlanParams';

export const useLessonPlanSearch = ({ classId, subjectId, active, search, t }) => {
    const [lessons, setLessons] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [reloadToken, setReloadToken] = useState(0);
    const scopeKey = `${classId || ''}|${subjectId || ''}`;
    const scopeRef = useRef(scopeKey);

    useEffect(() => {
        scopeRef.current = scopeKey;
    }, [scopeKey]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(String(search || '').trim()), LESSON_PLAN_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        let mounted = true;
        const startedScope = scopeRef.current;
        const canFetch = Boolean(classId && subjectId);
        if (!canFetch || !active) {
            return () => { mounted = false; };
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect -- the request starts below; the spinner must show from the first frame
        setLoading(true);
        setError('');
        api.get('/lessons', { params: buildLessonPlanParams({ classId, subjectId, search: debouncedSearch }) })
            .then((response) => {
                if (!mounted || scopeRef.current !== startedScope) return;
                setLessons(response.data?.data?.lessons || []);
            })
            .catch((fetchError) => {
                if (!mounted || scopeRef.current !== startedScope) return;
                setLessons([]);
                setError(fetchError.response?.data?.message
                    || t('grades:lessonLinks.loadError', { defaultValue: 'Failed to load lesson plans.' }));
            })
            .finally(() => {
                if (mounted && scopeRef.current === startedScope) setLoading(false);
            });

        return () => { mounted = false; };
    }, [active, classId, debouncedSearch, reloadToken, subjectId, t]);

    const reload = useCallback(() => setReloadToken((token) => token + 1), []);

    return { lessons, loading, error, reload, debouncedSearch };
};
