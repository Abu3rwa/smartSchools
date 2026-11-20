import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTheme, useMediaQuery, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { selectUser, selectIsImpersonating, selectHasMultipleRoles } from '../../store/slices/authSlice';
import { toggleSidebar, selectLanguage } from '../../store/slices/uiSlice';
import { selectSchoolFeatures } from '../../store/slices/schoolFeaturesSlice';
import {
    HiOutlineHome,
    HiOutlineMenu,
    HiOutlineStar,
    HiOutlineChevronDown,
} from 'react-icons/hi';
import ShortcutsMenu from './header/ShortcutsMenu';
import AccountMenu from './header/AccountMenu';
import ImpersonationBanner from './header/ImpersonationBanner';
import HeaderCreditChip from './header/HeaderCreditChip';
import { useHeaderShortcuts } from './header/useHeaderShortcuts';
import { useAiCreditBadge } from './header/useAiCreditBadge';
import { resolvePageContext } from './header/pageContext';
import './Header.css';

const HeaderTip = ({ tip, disabled, children }) => (
    <Tooltip title={tip} placement="bottom" disableInteractive>
        {/* a disabled button fires no pointer events, so the wrapper carries the hover */}
        <span className={disabled ? 'header-tip-wrap header-tip-wrap--disabled' : 'header-tip-wrap'}>
            {children}
        </span>
    </Tooltip>
);

const Header = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation(['layout.header', 'layout.sidebar', 'schoolSettings', 'common']);
    const user = useSelector(selectUser);
    const isStudent = user?.role === 'student';
    const schoolFeatures = useSelector(selectSchoolFeatures);
    const language = useSelector(selectLanguage);
    const hasMultipleRoles = useSelector(selectHasMultipleRoles);
    const muiTheme = useTheme();
    const isDesktop = useMediaQuery(muiTheme.breakpoints.up('md'));
    const isRtl = i18n.dir(language) === 'rtl';
    const isImpersonating = useSelector(selectIsImpersonating);

    const [userMenuAnchor, setUserMenuAnchor] = useState(null);
    const [shortcutsAnchor, setShortcutsAnchor] = useState(null);
    const accountBtnRef = useRef(null);
    const headerRef = useRef(null);
    const [headerWidth, setHeaderWidth] = useState(1200);

    // Collapse against the space the header actually has: the sidebar width
    // and RTL both change what fits at the same viewport.
    useEffect(() => {
        const element = headerRef.current;
        if (!element || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // border-box: the collapse thresholds are about the whole bar,
                // not the content left over after padding
                setHeaderWidth(entry.borderBoxSize?.[0]?.inlineSize || entry.target.clientWidth);
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const {
        maxShortcuts,
        availableShortcuts,
        selectedShortcutPaths,
        selectedShortcuts,
        currentShortcutPath,
        canPinCurrentPage,
        pinCurrentPage,
        toggleShortcut,
        reorderShortcuts,
    } = useHeaderShortcuts({
        user,
        schoolFeatures,
        locationPathname: location.pathname,
    });

    const credit = useAiCreditBadge(user);

    const pageContext = resolvePageContext(location.pathname, user?.role);
    const pageLabel = pageContext ? t(`layout.sidebar:items.${pageContext.labelKey}`) : '';
    const sectionLabel = pageContext
        ? t(`layout.sidebar:sections.${pageContext.section || 'overview'}`)
        : '';
    const roleLabel = user?.role
        ? t(`schoolSettings:roles.${user.role}`, { defaultValue: user.role })
        : '';
    const shortcutLabel = (shortcut) => t(`layout.sidebar:items.${shortcut.labelKey}`);

    const inlineLimit = headerWidth >= 1120 ? 3 : headerWidth >= 960 ? 2 : headerWidth >= 800 ? 1 : 0;
    const showSection = headerWidth >= 880;
    const showName = headerWidth >= 720;
    const showDesktopBalance = isDesktop && headerWidth >= 640;
    const visibleShortcuts = isDesktop ? selectedShortcuts.slice(0, inlineLimit) : [];

    const handleMenuClick = () => {
        dispatch(toggleSidebar());
    };

    const openShortcutsFromAccount = () => {
        setShortcutsAnchor(accountBtnRef.current);
    };

    return (
        <>
            <ImpersonationBanner />
            <header
                ref={headerRef}
                className={`header${isImpersonating ? ' header-impersonating' : ''}`}
            >
                <div className="header-left">
                    {isStudent && location.pathname !== '/portal/dashboard' && (
                        <HeaderTip tip={t('layout.sidebar:items.dashboard', { defaultValue: 'Home' })}>
                            <button
                                className="header-btn student-home-btn"
                                onClick={() => navigate('/portal/dashboard')}
                                aria-label={t('layout.sidebar:items.dashboard', { defaultValue: 'Home' })}
                            >
                                <HiOutlineHome size={20} />
                            </button>
                        </HeaderTip>
                    )}
                    {!isDesktop && !isStudent && (
                        <button
                            className="header-btn hamburger-btn"
                            onClick={handleMenuClick}
                            aria-label={t('layout.header:actions.openMenu')}
                        >
                            <HiOutlineMenu size={20} />
                        </button>
                    )}

                    {pageContext && (
                        <div className="header-breadcrumb">
                            {isDesktop && showSection && (
                                <>
                                    <span className="header-breadcrumb-section">{sectionLabel}</span>
                                    <span className="header-breadcrumb-sep" aria-hidden="true">/</span>
                                </>
                            )}
                            <span className="header-breadcrumb-page" title={pageLabel}>{pageLabel}</span>
                            {!isDesktop && hasMultipleRoles && (
                                <span className="header-breadcrumb-role">{roleLabel}</span>
                            )}
                        </div>
                    )}
                </div>

                <div className="header-right">
                    {isDesktop && !isStudent && (
                        <div className="header-shortcuts">
                            {visibleShortcuts.map((shortcut) => {
                                const isActive = currentShortcutPath === shortcut.path;
                                return (
                                    <button
                                        key={shortcut.path}
                                        className={`header-shortcut-btn${isActive ? ' active' : ''}`}
                                        onClick={() => navigate(shortcut.path)}
                                        aria-current={isActive ? 'page' : undefined}
                                    >
                                        {shortcutLabel(shortcut)}
                                    </button>
                                );
                            })}
                            <button
                                className="header-shortcuts-btn"
                                onClick={(event) => setShortcutsAnchor(event.currentTarget)}
                                aria-haspopup="dialog"
                                aria-expanded={!!shortcutsAnchor}
                            >
                                <HiOutlineStar size={18} aria-hidden="true" />
                                <span>{t('layout.header:menu.shortcuts')}</span>
                            </button>
                        </div>
                    )}

                    {showDesktopBalance && <HeaderCreditChip credit={credit} />}

                    <div className="user-menu">
                        <button
                            ref={accountBtnRef}
                            className="header-btn user-avatar-btn"
                            onClick={(event) => setUserMenuAnchor(event.currentTarget)}
                            aria-label={t('layout.header:actions.userMenu')}
                            aria-haspopup="menu"
                            aria-expanded={!!userMenuAnchor}
                        >
                            <span className="user-avatar-sm" aria-hidden="true">
                                {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                            </span>
                            {isDesktop && showName && (
                                <span className="header-user-name">{user?.firstName}</span>
                            )}
                            {isDesktop && showName && hasMultipleRoles && (
                                <span className="header-user-role">{roleLabel}</span>
                            )}
                            <HiOutlineChevronDown size={14} className="user-avatar-chevron" aria-hidden="true" />
                        </button>

                        <AccountMenu
                            anchorEl={userMenuAnchor}
                            open={!!userMenuAnchor}
                            onClose={() => setUserMenuAnchor(null)}
                            isRtl={isRtl}
                            isDesktop={isDesktop}
                            credit={credit}
                            onOpenShortcuts={openShortcutsFromAccount}
                        />

                        {!isStudent && (
                            <ShortcutsMenu
                                anchorEl={shortcutsAnchor}
                                open={!!shortcutsAnchor}
                                onClose={() => setShortcutsAnchor(null)}
                                isRtl={isRtl}
                                t={t}
                                maxShortcuts={maxShortcuts}
                                availableShortcuts={availableShortcuts}
                                selectedShortcutPaths={selectedShortcutPaths}
                                currentShortcutPath={currentShortcutPath}
                                canPinCurrentPage={canPinCurrentPage}
                                onPinCurrentPage={pinCurrentPage}
                                onToggleShortcut={toggleShortcut}
                                onReorderShortcuts={reorderShortcuts}
                                onNavigate={navigate}
                            />
                        )}
                    </div>
                </div>
            </header>
        </>
    );
};

export default Header;