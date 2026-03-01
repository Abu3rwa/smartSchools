import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSchools, selectSchools, selectSchoolLoading } from '../../../../store/slices/schoolSlice.js';
import { selectIsAuthenticated } from '../../../../store/slices/authSlice.js';
import { selectTheme, setTheme } from '../../../../store/slices/uiSlice.js';
import { getLandingContent } from '../../../../services/landingContentService.js';
import { landingPageDefaults } from '../../../../config/landingPageDefaults.js';

/**
 * Data and actions for Landing page. Preserves API calls, Redux, redirect, SEO script, scrollTo, handleAction.
 */
export function useLandingPageData() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const schools = useSelector(selectSchools);
    const loading = useSelector(selectSchoolLoading);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const themeMode = useSelector(selectTheme);

    const [searchTerm, setSearchTerm] = useState('');
    const [mobileOpen, setMobileOpen] = useState(false);
    const [content, setContent] = useState(landingPageDefaults);
    const [contentLoading, setContentLoading] = useState(true);
    const [contentError, setContentError] = useState('');

    const toggleTheme = useCallback(() => {
        dispatch(setTheme(themeMode === 'dark' ? 'light' : 'dark'));
    }, [dispatch, themeMode]);

    useEffect(() => {
        let mounted = true;
        if (isAuthenticated) {
            navigate('/portal', { replace: true });
            return undefined;
        }
        dispatch(fetchSchools());
        const loadLandingContent = async () => {
            setContentLoading(true);
            try {
                const response = await getLandingContent();
                if (mounted && response?.content) {
                    setContent(response.content);
                    setContentError('');
                }
            } catch (error) {
                if (mounted) {
                    setContentError(
                        error?.response?.data?.message || 'Unable to load latest landing content. Showing defaults.'
                    );
                }
            } finally {
                if (mounted) {
                    setContentLoading(false);
                }
            }
        };
        loadLandingContent();
        return () => {
            mounted = false;
        };
    }, [dispatch, isAuthenticated, navigate]);

    useEffect(() => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: content?.seo?.organizationName || content?.brand?.name || 'NextGen School',
            description: content?.seo?.description || 'School management platform for grades, attendance, timetables, and parent communication.',
            url: window.location.origin,
        });
        document.head.appendChild(script);
        return () => script.remove();
    }, [content]);

    const scrollTo = useCallback((id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        setMobileOpen(false);
    }, []);

    const handleAction = useCallback(
        (action) => {
            if (!action || typeof action !== 'string') return;
            if (action === '#') return;
            if (action === 'register') {
                navigate('/register-school');
                return;
            }
            if (action === 'login') {
                navigate('/login');
                return;
            }
            if (action.startsWith('scroll:')) {
                scrollTo(action.replace('scroll:', ''));
                return;
            }
            if (action.startsWith('mailto:')) {
                window.location.href = action;
                return;
            }
            if (action.startsWith('#')) {
                scrollTo(action.slice(1));
                return;
            }
            if (action.startsWith('http://') || action.startsWith('https://') || action === '/') {
                window.location.href = action;
            }
        },
        [navigate, scrollTo]
    );

    const searchTrimmed = searchTerm.trim().toLowerCase();
    const filtered =
        searchTrimmed ?
            schools.filter(
                (s) =>
                    s.name.toLowerCase().includes(searchTrimmed) ||
                    s.slug.toLowerCase().includes(searchTrimmed)
            )
        : schools;
    const schoolsToShow = filtered.slice(0, 8);
    const hasSearchFilter = searchTrimmed.length > 0;
    const totalSchoolCountLabel = `${schools.length} ${schools.length === 1 ? 'school' : 'schools'} available`;
    const filteredSchoolCountLabel = `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'}`;

    return {
        content,
        contentError,
        contentLoading,
        loading,
        schools,
        filtered,
        schoolsToShow,
        hasSearchFilter,
        searchTerm,
        setSearchTerm,
        mobileOpen,
        setMobileOpen,
        themeMode,
        toggleTheme,
        scrollTo,
        handleAction,
        navigate,
        totalSchoolCountLabel,
        filteredSchoolCountLabel,
    };
}
