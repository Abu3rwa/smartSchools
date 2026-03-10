import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { fetchSchools, selectSchools, selectSchoolLoading } from '../../../../store/slices/schoolSlice.js';
import { selectIsAuthenticated } from '../../../../store/slices/authSlice.js';
import { selectTheme, selectLanguage, setLanguage, setTheme } from '../../../../store/slices/uiSlice.js';
import { getLandingContent, getLandingDynamicBlocks } from '../../../../services/landingContentService.js';
import { landingPageDefaults, resolveLandingTemplate } from '../../../../config/landingPageDefaults.js';
import { isRtlLanguage, normalizeLanguage } from '../../../../i18n/config.js';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const mergeDeep = (base, patch) => {
    if (Array.isArray(base)) {
        return Array.isArray(patch) ? patch : base;
    }

    if (!isObject(base)) {
        return typeof patch === 'undefined' ? base : patch;
    }

    const next = { ...base };
    if (!isObject(patch)) return next;

    for (const [key, value] of Object.entries(patch)) {
        if (typeof value === 'undefined') continue;
        next[key] = key in base ? mergeDeep(base[key], value) : value;
    }

    return next;
};

/**
 * Data and actions for Landing page. Preserves API calls, Redux, redirect, SEO script, scrollTo, handleAction.
 */
export function useLandingPageData() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['landing.page']);
    const schools = useSelector(selectSchools);
    const loading = useSelector(selectSchoolLoading);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const themeMode = useSelector(selectTheme);
    const selectedLanguage = useSelector(selectLanguage);

    const language = useMemo(
        () => normalizeLanguage(selectedLanguage || i18n.resolvedLanguage || i18n.language),
        [i18n.language, i18n.resolvedLanguage, selectedLanguage]
    );
    const direction = useMemo(() => (isRtlLanguage(language) ? 'rtl' : 'ltr'), [language]);

    const uiText = useMemo(() => {
        const translatedUi = t('ui', {
            ns: 'landing.page',
            returnObjects: true,
            defaultValue: {},
        });
        return isObject(translatedUi) ? translatedUi : {};
    }, [language, t]);

    const [searchTerm, setSearchTerm] = useState('');
    const [mobileOpen, setMobileOpen] = useState(false);
    const [content, setContent] = useState(landingPageDefaults);
    const [contentLoading, setContentLoading] = useState(false);
    const [contentError, setContentError] = useState('');
    const [dynamicBlocks, setDynamicBlocks] = useState({
        announcement: null,
        promotions: [],
        testimonials: [],
        resolvedLanguage: 'en',
        fallbackUsed: false,
    });
    const [dynamicLoading, setDynamicLoading] = useState(false);
    const [dynamicError, setDynamicError] = useState('');

    const toggleTheme = useCallback(() => {
        dispatch(setTheme(themeMode === 'dark' ? 'light' : 'dark'));
    }, [dispatch, themeMode]);

    const switchLanguage = useCallback(
        (nextLanguage) => {
            const normalized = normalizeLanguage(nextLanguage);
            dispatch(setLanguage(normalized));
            if (i18n.resolvedLanguage !== normalized) {
                i18n.changeLanguage(normalized);
            }
        },
        [dispatch, i18n]
    );

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/portal', { replace: true });
            return undefined;
        }

        dispatch(fetchSchools());
    }, [dispatch, isAuthenticated, navigate]);

    useEffect(() => {
        let mounted = true;

        const loadLandingContent = async () => {
            setContentLoading(true);
            try {
                const response = await getLandingContent(language);
                if (mounted) {
                    setContent(mergeDeep(landingPageDefaults, response?.content || {}));
                    setContentError('');
                }
            } catch (error) {
                if (mounted) {
                    setContent(landingPageDefaults);
                    setContentError(
                        error?.response?.data?.message || 'Unable to load latest landing content. Showing CMS defaults.'
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
    }, [language]);

    useEffect(() => {
        let mounted = true;

        const fallbackDynamic = {
            ...(content?.dynamicFallback || landingPageDefaults.dynamicFallback || {}),
            resolvedLanguage: language,
            fallbackUsed: true,
        };

        const loadDynamicBlocks = async () => {
            setDynamicLoading(true);
            try {
                const response = await getLandingDynamicBlocks(language);
                if (mounted && response?.blocks) {
                    setDynamicBlocks({
                        ...fallbackDynamic,
                        ...response.blocks,
                        resolvedLanguage: response.resolvedLanguage || language,
                        fallbackUsed: Boolean(response.fallbackUsed),
                    });
                    setDynamicError('');
                }
            } catch (error) {
                if (mounted) {
                    setDynamicBlocks(fallbackDynamic);
                    setDynamicError(error?.response?.data?.message || '');
                }
            } finally {
                if (mounted) {
                    setDynamicLoading(false);
                }
            }
        };

        loadDynamicBlocks();
        return () => {
            mounted = false;
        };
    }, [content?.dynamicFallback, language]);

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
    const totalSchoolCountLabel = resolveLandingTemplate(
        content.findSchool.totalSchoolsLabelTemplate || '{{count}} schools available',
        { count: schools.length }
    );
    const filteredSchoolCountLabel = resolveLandingTemplate(
        content.findSchool.filteredResultsLabelTemplate || '{{count}} results',
        { count: filtered.length }
    );

    return {
        language,
        direction,
        uiText,
        content,
        contentError,
        contentLoading,
        dynamicBlocks,
        dynamicLoading,
        dynamicError,
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
        switchLanguage,
        scrollTo,
        handleAction,
        navigate,
        totalSchoolCountLabel,
        filteredSchoolCountLabel,
    };
}
