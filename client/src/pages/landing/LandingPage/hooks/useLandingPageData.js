/**
 * Data and interaction orchestration for the public landing page.
 *
 * The page owns only its own request state: the public plan list, the bounded
 * school finder, the selected plan interest and the demo submission status.
 * It never reads CMS content, the shared school directory, or private app data,
 * and it never redirects authenticated visitors — the root route owns that.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    selectAppName,
    selectLanguage,
    selectTheme,
    setLanguage,
    setTheme,
} from '../../../../store/slices/uiSlice.js';
import { getLandingPlans, searchLandingSchools } from '../../../../services/landingContentService.js';
import { normalizePublicPlans } from '../utils/landingPagePresentation.js';
import { isRtlLanguage, normalizeLanguage } from '../../../../i18n/config.js';
import { markReturning } from '../../../../utils/returningVisitor.js';

export const LANDING_SECTION_TARGETS = {
    home: { sectionId: 'home', headingId: 'home-heading' },
    product: { sectionId: 'product', headingId: 'product-heading' },
    learning: { sectionId: 'learning-tools', headingId: 'learning-tools-heading' },
    pricing: { sectionId: 'pricing', headingId: 'pricing-heading' },
    faq: { sectionId: 'faq', headingId: 'faq-heading' },
    demo: { sectionId: 'book-demo', headingId: 'book-demo-heading' },
};

const FINDER_MIN_LENGTH = 2;
const FINDER_MAX_LENGTH = 80;
const FINDER_DEBOUNCE_MS = 400;
const DESKTOP_NAV_QUERY = '(min-width: 1200px)';

const focusNode = (node) => {
    if (node && typeof node.focus === 'function') {
        node.focus({ preventScroll: true });
        return true;
    }
    return false;
};

const focusBrandLink = () => focusNode(document.getElementById('landing-brand-link'));
const focusMenuTrigger = () => focusNode(document.getElementById('landing-menu-trigger'));

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useLandingPageData() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation(['landing.page']);

    const themeMode = useSelector(selectTheme);
    const appName = useSelector(selectAppName);
    const selectedLanguage = useSelector(selectLanguage);

    const language = useMemo(
        () => normalizeLanguage(selectedLanguage || i18n.resolvedLanguage || i18n.language),
        [i18n.language, i18n.resolvedLanguage, selectedLanguage]
    );
    const direction = useMemo(() => (isRtlLanguage(language) ? 'rtl' : 'ltr'), [language]);

    const copy = useMemo(() => {
        const value = t('publicPage', { ns: 'landing.page', returnObjects: true, appName });
        return value && typeof value === 'object' ? value : {};
    }, [t, appName]);

    const navItems = useMemo(
        () => [
            { id: 'product', label: copy.nav?.product || '', sectionId: 'product' },
            { id: 'learning', label: copy.nav?.learning || '', sectionId: 'learning-tools' },
            { id: 'pricing', label: copy.nav?.pricing || '', sectionId: 'pricing' },
            { id: 'faq', label: copy.nav?.faq || '', sectionId: 'faq' },
        ],
        [copy]
    );

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

    /* ----------------------------------------------------------------- plans */

    const [plansState, setPlansState] = useState({ status: 'loading', plans: [], errorCode: null });
    const [plansRequestId, setPlansRequestId] = useState(0);

    useEffect(() => {
        let active = true;

        getLandingPlans()
            .then((rawPlans) => {
                if (!active) return;
                try {
                    const plans = normalizePublicPlans(rawPlans);
                    setPlansState({
                        status: plans.length > 0 ? 'success' : 'empty',
                        plans,
                        errorCode: null,
                    });
                } catch (error) {
                    if (!active) return;
                    setPlansState({
                        status: 'error',
                        plans: [],
                        errorCode: error?.code === 'invalidResponse' ? 'invalidResponse' : 'unavailable',
                    });
                }
            })
            .catch((error) => {
                if (!active) return;
                setPlansState({
                    status: 'error',
                    plans: [],
                    errorCode: error?.code === 'invalidResponse' ? 'invalidResponse' : 'unavailable',
                });
            });

        return () => {
            active = false;
        };
    }, [plansRequestId]);

    const retryPlans = useCallback(() => {
        setPlansState({ status: 'loading', plans: [], errorCode: null });
        setPlansRequestId((value) => value + 1);
    }, []);

    /* ------------------------------------------------------- plan interest */

    const [selectedPlanKey, setSelectedPlanKey] = useState('');
    const [demoStatus, setDemoStatus] = useState('idle');
    const [planNotice, setPlanNotice] = useState('');

    // A plan that is no longer listed is not shown as selected, and the form
    // explains that it was dropped instead of keeping a hidden selection.
    const planStillListed =
        !selectedPlanKey ||
        (plansState.status === 'success'
            ? plansState.plans.some((plan) => plan.key === selectedPlanKey)
            : true);
    const visiblePlanKey = planStillListed ? selectedPlanKey : '';
    const visiblePlanNotice = planStillListed ? planNotice : 'planCleared';

    const selectPlan = useCallback(
        (planKey) => {
            if (demoStatus === 'submitting' || demoStatus === 'success') return false;
            setSelectedPlanKey(planKey || '');
            setPlanNotice('');
            return true;
        },
        [demoStatus]
    );

    const clearPlan = useCallback(() => {
        setSelectedPlanKey('');
        setPlanNotice('');
    }, []);

    /* ---------------------------------------------------------- navigation */

    const navigateSection = useCallback(
        (sectionId, options = {}) => {
            const { focus = true, updateHash = true } = options;
            const target = LANDING_SECTION_TARGETS[sectionId] || LANDING_SECTION_TARGETS.product;

            let resolved = target;
            let sectionElement = document.getElementById(target.sectionId);
            if (!sectionElement && target.sectionId === 'learning-tools') {
                resolved = LANDING_SECTION_TARGETS.product;
                sectionElement = document.getElementById(resolved.sectionId);
            }
            if (!sectionElement) return;

            if (updateHash && typeof window !== 'undefined') {
                const nextHash = `#${resolved.sectionId}`;
                if (window.location.hash !== nextHash) {
                    navigate({ pathname: location.pathname, hash: nextHash });
                }
            }

            sectionElement.scrollIntoView({
                behavior: prefersReducedMotion() ? 'auto' : 'smooth',
                block: 'start',
            });

            if (focus) {
                focusNode(document.getElementById(resolved.headingId));
            }
        },
        [location.pathname, navigate]
    );

    const navigateToSignIn = useCallback(() => {
        markReturning();
        navigate('/login');
    }, [navigate]);

    const navigateToRegister = useCallback(() => {
        navigate('/register-school');
    }, [navigate]);

    /* --------------------------------------------------------------- drawer */

    const [mobileOpen, setMobileOpen] = useState(false);
    const pendingDrawerActionRef = useRef(null);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const query = window.matchMedia(DESKTOP_NAV_QUERY);
        const handleChange = (event) => {
            if (event.matches) {
                pendingDrawerActionRef.current = () => {
                    focusBrandLink();
                };
                setMobileOpen(false);
            }
        };
        query.addEventListener('change', handleChange);
        return () => query.removeEventListener('change', handleChange);
    }, []);

    const openMenu = useCallback(() => {
        setMobileOpen(true);
    }, []);

    const closeMobileDrawer = useCallback((afterClose) => {
        pendingDrawerActionRef.current = typeof afterClose === 'function' ? afterClose : null;
        setMobileOpen(false);
    }, []);

    const handleDrawerClosed = useCallback(() => {
        const action = pendingDrawerActionRef.current;
        pendingDrawerActionRef.current = null;
        if (action) {
            action();
            return;
        }
        if (!focusMenuTrigger()) focusBrandLink();
    }, []);

    const navigateFromDrawer = useCallback(
        (sectionId) => {
            closeMobileDrawer(() => navigateSection(sectionId));
        },
        [closeMobileDrawer, navigateSection]
    );

    /* --------------------------------------------------------------- finder */

    const [finderOpen, setFinderOpen] = useState(false);
    const [finderQuery, setFinderQueryValue] = useState('');
    const [finderState, setFinderState] = useState({
        status: 'idle',
        query: '',
        schools: [],
        hasMore: false,
        errorCode: null,
    });

    const finderStateRef = useRef(finderState);
    const finderTimerRef = useRef(null);
    const finderAbortRef = useRef(null);
    const finderTokenRef = useRef(0);
    const finderNormalizedRef = useRef('');
    const finderOpenRef = useRef(false);
    const finderOpenerRef = useRef(null);

    const applyFinderState = useCallback((nextState) => {
        finderStateRef.current = nextState;
        setFinderState(nextState);
    }, []);

    const cancelFinderRequest = useCallback(() => {
        if (finderTimerRef.current) {
            clearTimeout(finderTimerRef.current);
            finderTimerRef.current = null;
        }
        if (finderAbortRef.current) {
            finderAbortRef.current.abort();
            finderAbortRef.current = null;
        }
        finderTokenRef.current += 1;
    }, []);

    const runFinderSearch = useCallback(
        (normalizedQuery, token) => {
            const controller = new AbortController();
            finderAbortRef.current = controller;

            const current = finderStateRef.current;
            if (current.status === 'debouncing' && current.query === normalizedQuery) {
                applyFinderState({ ...current, status: 'loading' });
            }

            searchLandingSchools(normalizedQuery, { signal: controller.signal })
                .then((result) => {
                    if (!finderOpenRef.current) return;
                    if (finderTokenRef.current !== token) return;
                    if (finderNormalizedRef.current !== normalizedQuery) return;

                    const schools = Array.isArray(result?.schools) ? result.schools : [];
                    applyFinderState({
                        status: schools.length > 0 ? 'success' : 'empty',
                        query: normalizedQuery,
                        schools,
                        hasMore: Boolean(result?.hasMore),
                        errorCode: null,
                    });
                })
                .catch((error) => {
                    if (!finderOpenRef.current) return;
                    if (finderTokenRef.current !== token) return;
                    if (finderNormalizedRef.current !== normalizedQuery) return;
                    if (error?.code === 'cancelled' || controller.signal.aborted) return;

                    applyFinderState({
                        status: 'error',
                        query: normalizedQuery,
                        schools: [],
                        hasMore: false,
                        errorCode: error?.code === 'invalidResponse' ? 'invalidResponse' : 'unavailable',
                    });
                });
        },
        [applyFinderState]
    );

    const setFinderQuery = useCallback(
        (nextValue) => {
            const rawValue = typeof nextValue === 'string' ? nextValue : '';
            setFinderQueryValue(rawValue);

            const normalizedQuery = rawValue.trim();
            const current = finderStateRef.current;
            const keepsCurrentRequest =
                current.status === 'debouncing' ||
                current.status === 'loading' ||
                current.status === 'success' ||
                current.status === 'empty';

            if (keepsCurrentRequest && current.query === normalizedQuery) {
                return;
            }

            cancelFinderRequest();
            finderNormalizedRef.current = normalizedQuery;

            if (normalizedQuery.length < FINDER_MIN_LENGTH) {
                applyFinderState({
                    status: 'idle',
                    query: normalizedQuery,
                    schools: [],
                    hasMore: false,
                    errorCode: null,
                });
                return;
            }

            if (normalizedQuery.length > FINDER_MAX_LENGTH) {
                applyFinderState({
                    status: 'invalid',
                    query: normalizedQuery,
                    schools: [],
                    hasMore: false,
                    errorCode: 'invalidQuery',
                });
                return;
            }

            applyFinderState({
                status: 'debouncing',
                query: normalizedQuery,
                schools: [],
                hasMore: false,
                errorCode: null,
            });

            const token = finderTokenRef.current;
            finderTimerRef.current = setTimeout(() => {
                finderTimerRef.current = null;
                if (!finderOpenRef.current) return;
                if (finderTokenRef.current !== token) return;
                if (finderNormalizedRef.current !== normalizedQuery) return;
                runFinderSearch(normalizedQuery, token);
            }, FINDER_DEBOUNCE_MS);
        },
        [applyFinderState, cancelFinderRequest, runFinderSearch]
    );

    const retryFinder = useCallback(() => {
        const normalizedQuery = finderStateRef.current.query;
        if (
            !normalizedQuery ||
            normalizedQuery.length < FINDER_MIN_LENGTH ||
            normalizedQuery.length > FINDER_MAX_LENGTH
        ) {
            return;
        }

        cancelFinderRequest();
        finderNormalizedRef.current = normalizedQuery;
        const token = finderTokenRef.current;
        applyFinderState({
            status: 'loading',
            query: normalizedQuery,
            schools: [],
            hasMore: false,
            errorCode: null,
        });
        runFinderSearch(normalizedQuery, token);
    }, [applyFinderState, cancelFinderRequest, runFinderSearch]);

    const openFinder = useCallback(
        (opener) => {
            finderOpenerRef.current = opener || null;
            finderOpenRef.current = true;
            setFinderOpen(true);
            cancelFinderRequest();
            finderNormalizedRef.current = '';
            setFinderQueryValue('');
            applyFinderState({
                status: 'idle',
                query: '',
                schools: [],
                hasMore: false,
                errorCode: null,
            });
        },
        [applyFinderState, cancelFinderRequest]
    );

    const closeFinder = useCallback(() => {
        finderOpenRef.current = false;
        setFinderOpen(false);
        cancelFinderRequest();
        finderNormalizedRef.current = '';
        setFinderQueryValue('');
        applyFinderState({
            status: 'idle',
            query: '',
            schools: [],
            hasMore: false,
            errorCode: null,
        });

        const opener = finderOpenerRef.current;
        finderOpenerRef.current = null;
        window.requestAnimationFrame(() => {
            const survives = opener && document.body.contains(opener);
            if (!focusNode(survives ? opener : document.getElementById('landing-brand-link'))) {
                focusBrandLink();
            }
        });
    }, [applyFinderState, cancelFinderRequest]);

    const openFinderFromDrawer = useCallback(() => {
        closeMobileDrawer(() => openFinder(document.getElementById('landing-menu-trigger')));
    }, [closeMobileDrawer, openFinder]);

    useEffect(
        () => () => {
            if (finderTimerRef.current) clearTimeout(finderTimerRef.current);
            if (finderAbortRef.current) finderAbortRef.current.abort();
        },
        []
    );

    /* ------------------------------------------------------------ plan cta */

    const requestPlan = useCallback(
        (planKey) => {
            if (!selectPlan(planKey)) return false;
            navigateSection('demo');
            return true;
        },
        [navigateSection, selectPlan]
    );

    return {
        copy,
        appName,
        language,
        direction,
        themeMode,
        toggleTheme,
        switchLanguage,
        navItems,
        plansState,
        retryPlans,
        selectedPlanKey: visiblePlanKey,
        requestPlan,
        selectPlan,
        clearPlan,
        planNotice: visiblePlanNotice,
        demoStatus,
        setDemoStatus,
        mobileOpen,
        openMenu,
        closeMobileDrawer,
        handleDrawerClosed,
        navigateFromDrawer,
        finderOpen,
        finderQuery,
        setFinderQuery,
        finderState,
        retryFinder,
        openFinder,
        closeFinder,
        openFinderFromDrawer,
        navigateSection,
        navigateToSignIn,
        navigateToRegister,
    };
}
