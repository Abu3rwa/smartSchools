import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTheme, useMediaQuery, Menu, MenuItem, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { selectUser, logout, selectIsImpersonating } from '../../store/slices/authSlice';
import {
    selectTheme,
    setTheme,
    toggleSidebar,
    selectLanguage,
    setLanguage,
} from '../../store/slices/uiSlice';
import { selectSchoolFeatures } from '../../store/slices/schoolFeaturesSlice';
import {
    HiOutlineHome,
    HiOutlineMoon,
    HiOutlineSun,
    HiOutlineLogout,
    HiOutlineMenu,
    HiOutlineCog,
    HiOutlineStar,
    HiOutlinePlus,
    HiOutlineCheck,
    HiOutlineDotsHorizontal,
} from 'react-icons/hi';
import ShortcutsMenu from './header/ShortcutsMenu';
import RoleSwitcher from './header/RoleSwitcher';
import ImpersonationBanner from './header/ImpersonationBanner';
import AcademicYearFilter from './header/AcademicYearFilter';
import { useHeaderShortcuts } from './header/useHeaderShortcuts';
import './Header.css';

// How many pinned links sit in the bar before the rest fold into "+N"
const WIDE_CHIP_LIMIT = 5;
const NARROW_CHIP_LIMIT = 3;

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
    const theme = useSelector(selectTheme);
    const language = useSelector(selectLanguage);
    const muiTheme = useTheme();
    const isDesktop = useMediaQuery(muiTheme.breakpoints.up('md'));
    const isWide = useMediaQuery('(min-width: 1280px)');
    const isRtl = i18n.dir(language) === 'rtl';
    const isImpersonating = useSelector(selectIsImpersonating);

    const [userMenuAnchor, setUserMenuAnchor] = useState(null);
    const [shortcutsMenuAnchor, setShortcutsMenuAnchor] = useState(null);
    const [overflowMenuAnchor, setOverflowMenuAnchor] = useState(null);
    const manageShortcutsBtnRef = useRef(null);

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

    const currentShortcut = availableShortcuts.find((item) => item.path === currentShortcutPath);
    const isCurrentPagePinned = !!currentShortcutPath && selectedShortcutPaths.includes(currentShortcutPath);
    const chipLimit = isWide ? WIDE_CHIP_LIMIT : NARROW_CHIP_LIMIT;
    const visibleShortcuts = selectedShortcuts.slice(0, chipLimit);
    const currentOverflowIndex = selectedShortcuts.findIndex((item) => item.path === currentShortcutPath);
    if (currentOverflowIndex >= chipLimit) {
        // the page you are on should never be hidden behind "+N"
        visibleShortcuts[chipLimit - 1] = selectedShortcuts[currentOverflowIndex];
    }
    const visibleShortcutPaths = new Set(visibleShortcuts.map((item) => item.path));
    const overflowShortcuts = selectedShortcuts.filter((item) => !visibleShortcutPaths.has(item.path));
    const shortcutLabel = (shortcut) => t(`layout.sidebar:items.${shortcut.labelKey}`);
    const roleLabel = user?.role
        ? t(`schoolSettings:roles.${user.role}`, { defaultValue: user.role })
        : '';

    const handleLogout = () => {
        setUserMenuAnchor(null);
        dispatch(logout());
        navigate('/');
    };

    const handleThemeToggle = () => {
        dispatch(setTheme(theme === 'dark' ? 'light' : 'dark'));
    };

    const handleMenuClick = () => {
        dispatch(toggleSidebar());
    };

    const handleLanguageToggle = () => {
        dispatch(setLanguage(language === 'ar' ? 'en' : 'ar'));
    };

    const pinTip = isCurrentPagePinned
        ? t('layout.header:actions.unpinCurrentPage')
        : t('layout.header:actions.pinCurrentPage');

    const handlePinClick = () => {
        if (isCurrentPagePinned) {
            toggleShortcut(currentShortcutPath);
            return;
        }
        pinCurrentPage();
    };

    return (
        <>
            <ImpersonationBanner />
            <header className={`header${isImpersonating ? ' header-impersonating' : ''}`}>
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

                {currentShortcut && (
                    <div className="header-breadcrumb">
                        <span className="header-breadcrumb-section">
                            {t(`layout.sidebar:sections.${currentShortcut.section || 'overview'}`)}
                        </span>
                        <span className="header-breadcrumb-sep" aria-hidden="true">/</span>
                        <span className="header-breadcrumb-page">{shortcutLabel(currentShortcut)}</span>
                    </div>
                )}
            </div>

            <div className="header-right">
                {isDesktop && !isStudent && (
                    <>
                        <div className="header-shortcuts">
                            {visibleShortcuts.map((shortcut) => {
                                const isActive = currentShortcutPath === shortcut.path;
                                return (
                                    <button
                                        key={shortcut.path}
                                        className={`header-shortcut-btn ${isActive ? 'active' : ''}`}
                                        onClick={() => navigate(shortcut.path)}
                                        aria-current={isActive ? 'page' : undefined}
                                    >
                                        {shortcutLabel(shortcut)}
                                    </button>
                                );
                            })}
                            {overflowShortcuts.length > 0 && (
                                <button
                                    className="header-shortcut-btn header-shortcut-more"
                                    onClick={(event) => setOverflowMenuAnchor(event.currentTarget)}
                                    aria-haspopup="true"
                                    aria-expanded={!!overflowMenuAnchor}
                                    aria-label={t('layout.header:shortcuts.more', { total: overflowShortcuts.length })}
                                >
                                    +{overflowShortcuts.length}
                                </button>
                            )}
                        </div>

                        {currentShortcut && (
                            <HeaderTip tip={pinTip} disabled={!isCurrentPagePinned && !canPinCurrentPage}>
                                <button
                                    className={`header-btn header-pin-btn ${isCurrentPagePinned ? 'pinned' : ''}`}
                                    onClick={handlePinClick}
                                    disabled={!isCurrentPagePinned && !canPinCurrentPage}
                                    aria-label={pinTip}
                                    aria-pressed={isCurrentPagePinned}
                                >
                                    {isCurrentPagePinned ? <HiOutlineCheck size={19} /> : <HiOutlinePlus size={20} />}
                                </button>
                            </HeaderTip>
                        )}

                        <HeaderTip tip={t('layout.header:actions.manageShortcuts')}>
                            <button
                                ref={manageShortcutsBtnRef}
                                className="header-btn"
                                onClick={(event) => setShortcutsMenuAnchor(event.currentTarget)}
                                aria-label={t('layout.header:actions.manageShortcuts')}
                                aria-haspopup="dialog"
                                aria-expanded={!!shortcutsMenuAnchor}
                            >
                                <HiOutlineStar size={20} />
                            </button>
                        </HeaderTip>

                        <span className="header-divider" />
                    </>
                )}

                {!isStudent && <AcademicYearFilter />}

                <RoleSwitcher isRtl={isRtl} />

                <HeaderTip tip={t('layout.header:actions.toggleTheme')}>
                    <button
                        className="header-btn"
                        onClick={handleThemeToggle}
                        aria-label={t('layout.header:actions.toggleTheme')}
                    >
                        {theme === 'dark' ? <HiOutlineSun size={20} /> : <HiOutlineMoon size={20} />}
                    </button>
                </HeaderTip>

                <HeaderTip tip={t('layout.header:actions.toggleLanguageTo', {
                    language: language === 'ar' ? 'English' : 'العربية',
                })}>
                    <button
                        className="header-btn header-lang-btn"
                        onClick={handleLanguageToggle}
                        aria-label={t('layout.header:actions.toggleLanguage')}
                    >
                        {language.toUpperCase()}
                    </button>
                </HeaderTip>

                {!isStudent && <div className="header-divider" />}

                <div className="user-menu">
                    <HeaderTip tip={user ? `${user.firstName} ${user.lastName}` : t('layout.header:actions.userMenu')}>
                        <button
                            className="header-btn user-avatar-btn"
                            onClick={(event) => setUserMenuAnchor(event.currentTarget)}
                            aria-label={t('layout.header:actions.userMenu')}
                            aria-haspopup="true"
                            aria-expanded={!!userMenuAnchor}
                        >
                            <div className="user-avatar-sm">
                                {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                            </div>
                            {isDesktop && (
                                <div className="header-user-meta">
                                    <span className="header-user-name">{user?.firstName}</span>
                                    <span className="header-user-role">{roleLabel}</span>
                                </div>
                            )}
                        </button>
                    </HeaderTip>

                    <Menu
                        anchorEl={userMenuAnchor}
                        open={!!userMenuAnchor}
                        onClose={() => setUserMenuAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: isRtl ? 'left' : 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: isRtl ? 'left' : 'right' }}
                        PaperProps={{ sx: { minWidth: 220, mt: 1 } }}
                    >
                        <div className="header-menu-identity">
                            <span className="header-menu-name">{user?.firstName} {user?.lastName}</span>
                            <span className="header-menu-role">{roleLabel}</span>
                        </div>
                        <MenuItem onClick={() => { setUserMenuAnchor(null); navigate('/portal/settings'); }}>
                            <HiOutlineCog size={18} style={{ marginInlineEnd: 8 }} />
                            {t('layout.header:menu.settings')}
                        </MenuItem>
                        <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                            <HiOutlineLogout size={18} style={{ marginInlineEnd: 8 }} /> {t('layout.header:menu.logout')}
                        </MenuItem>
                    </Menu>

                    <Menu
                        anchorEl={overflowMenuAnchor}
                        open={!!overflowMenuAnchor}
                        onClose={() => setOverflowMenuAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: isRtl ? 'left' : 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: isRtl ? 'left' : 'right' }}
                        PaperProps={{ sx: { minWidth: 220, mt: 1 } }}
                    >
                        {overflowShortcuts.map((shortcut) => (
                            <MenuItem
                                key={`overflow-${shortcut.path}`}
                                onClick={() => {
                                    setOverflowMenuAnchor(null);
                                    navigate(shortcut.path);
                                }}
                            >
                                {shortcutLabel(shortcut)}
                            </MenuItem>
                        ))}
                        <MenuItem
                            onClick={() => {
                                setOverflowMenuAnchor(null);
                                setShortcutsMenuAnchor(manageShortcutsBtnRef.current);
                            }}
                        >
                            <HiOutlineDotsHorizontal size={18} style={{ marginInlineEnd: 8 }} />
                            {t('layout.header:actions.manageShortcuts')}
                        </MenuItem>
                    </Menu>

                    <ShortcutsMenu
                        anchorEl={shortcutsMenuAnchor}
                        open={!!shortcutsMenuAnchor}
                        onClose={() => setShortcutsMenuAnchor(null)}
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
                    />
                </div>
            </div>
        </header>
        </>
    );
};

export default Header;
