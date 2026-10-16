import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTheme, useMediaQuery, Menu, MenuItem } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { selectUser, logout, selectIsImpersonating } from '../../store/slices/authSlice';
import {
    selectTheme,
    setTheme,
    toggleSidebar,
    selectLanguage,
    setLanguage,
} from '../../store/slices/uiSlice';
import { selectSchoolFeatures, selectSchoolPageAccess } from '../../store/slices/schoolFeaturesSlice';
import {
    HiOutlineHome,
    HiOutlineMoon,
    HiOutlineSun,
    HiOutlineLogout,
     HiOutlineBell,
    HiOutlineMenu,
    HiOutlineCog,
    HiOutlineStar,
    HiOutlinePlus,
} from 'react-icons/hi';
import { HiOutlineLockClosed } from 'react-icons/hi2';
import notificationService from '../../services/notificationService';
import ShortcutsMenu from './header/ShortcutsMenu';
import RoleSwitcher from './header/RoleSwitcher';
import ImpersonationBanner from './header/ImpersonationBanner';
import AcademicYearFilter from './header/AcademicYearFilter';
import { useHeaderShortcuts } from './header/useHeaderShortcuts';
import { getSchoolPageKeyForPath, isSchoolPageLocked } from '../../constants/schoolPageAccess';
import './Header.css';

const Header = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation(['layout.header', 'layout.sidebar', 'common']);
    const user = useSelector(selectUser);
    const isStudent = user?.role === 'student';
    const schoolFeatures = useSelector(selectSchoolFeatures);
    const pageAccess = useSelector(selectSchoolPageAccess);
    const theme = useSelector(selectTheme);
    const language = useSelector(selectLanguage);
    const muiTheme = useTheme();
    const isDesktop = useMediaQuery(muiTheme.breakpoints.up('md'));
    const isRtl = i18n.dir(language) === 'rtl';
    const isImpersonating = useSelector(selectIsImpersonating);

    const [notificationCount, setNotificationCount] = useState(0);
    const [userMenuAnchor, setUserMenuAnchor] = useState(null);
    const [shortcutsMenuAnchor, setShortcutsMenuAnchor] = useState(null);

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
        pageAccess,
        locationPathname: location.pathname,
    });
    const isDashboardLocked = isSchoolPageLocked(
        pageAccess,
        user?.role,
        getSchoolPageKeyForPath('/portal/dashboard'),
    );
    const isNotificationsLocked = isSchoolPageLocked(
        pageAccess,
        user?.role,
        getSchoolPageKeyForPath('/portal/notifications'),
    );
    const isSettingsLocked = isSchoolPageLocked(
        pageAccess,
        user?.role,
        getSchoolPageKeyForPath('/portal/settings'),
    );

    useEffect(() => {
        let cancelled = false;
        notificationService.getNotificationHistory({ status: 'pending', limit: 1 })
            .then((res) => {
                if (cancelled) return;
                const data = res?.data ?? res;
                const total = data?.pagination?.total ?? 0;
                setNotificationCount(total);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

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

   

    const handleNotificationClick = () => {
        navigate('/portal/notifications');
    };

    const notificationsAriaLabel = notificationCount > 0
        ? t('layout.header:actions.notificationsAria', { count: notificationCount })
        : t('layout.header:actions.notifications');

    return (
        <>
            <ImpersonationBanner />
            <header className={`header${isImpersonating ? ' header-impersonating' : ''}`}>
            <div className="header-left">
                {isStudent && location.pathname !== '/portal/dashboard' && (
                    <button
                        className="header-btn student-home-btn"
                        onClick={() => navigate('/portal/dashboard')}
                        disabled={isDashboardLocked}
                        aria-label={t('layout.sidebar:items.dashboard', { defaultValue: 'Home' })}
                        title={isDashboardLocked
                            ? t('layout.sidebar:actions.featureLocked')
                            : t('layout.sidebar:items.dashboard', { defaultValue: 'Home' })}
                    >
                        {isDashboardLocked ? <HiOutlineLockClosed size={20} /> : <HiOutlineHome size={20} />}
                    </button>
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

                
            </div>

            <div className="header-right">
                {isDesktop && !isStudent && (
                    <>
                        <div className="header-shortcuts">
                            {selectedShortcuts.length === 0 ? (
                                <span className="header-shortcuts-empty">{t('layout.header:shortcuts.none')}</span>
                            ) : selectedShortcuts.map((shortcut) => {
                                const isActive = currentShortcutPath === shortcut.path;
                                return (
                                    <button
                                        key={shortcut.path}
                                        className={`header-shortcut-btn ${isActive ? 'active' : ''} ${shortcut.locked ? 'locked' : ''}`}
                                        onClick={() => navigate(shortcut.path)}
                                        disabled={shortcut.locked}
                                        title={shortcut.locked
                                            ? t('layout.sidebar:actions.featureLocked')
                                            : t(`layout.sidebar:items.${shortcut.labelKey}`)}
                                    >
                                        {t(`layout.sidebar:items.${shortcut.labelKey}`)}
                                        {shortcut.locked && <HiOutlineLockClosed size={14} aria-hidden="true" />}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            className="header-btn"
                            onClick={pinCurrentPage}
                            disabled={!canPinCurrentPage}
                            aria-label={t('layout.header:actions.pinCurrentPage')}
                            title={t('layout.header:actions.pinCurrentPage')}
                        >
                            <HiOutlinePlus size={20} />
                        </button>

                        <button
                            className="header-btn"
                            onClick={(event) => setShortcutsMenuAnchor(event.currentTarget)}
                            aria-label={t('layout.header:actions.manageShortcuts')}
                            title={t('layout.header:actions.manageShortcuts')}
                        >
                            <HiOutlineStar size={20} />
                        </button>
                    </>
                )}

                <AcademicYearFilter />

                <RoleSwitcher isRtl={isRtl} />

                
                <button
                    className="header-btn"
                    onClick={handleThemeToggle}
                    aria-label={t('layout.header:actions.toggleTheme')}
                >
                    {theme === 'dark' ? <HiOutlineSun size={20} /> : <HiOutlineMoon size={20} />}
                </button>

                <button
                    className="header-btn"
                    onClick={handleLanguageToggle}
                    aria-label={t('layout.header:actions.toggleLanguage')}
                    title={t('layout.header:actions.toggleLanguage')}
                >
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{language.toUpperCase()}</span>
                </button>

                <button
                    className="header-btn notification-btn"
                    onClick={handleNotificationClick}
                    aria-label={notificationsAriaLabel}
                    disabled={isNotificationsLocked}
                    title={isNotificationsLocked ? t('layout.sidebar:actions.featureLocked') : undefined}
                >
                    {isNotificationsLocked ? <HiOutlineLockClosed size={20} /> : <HiOutlineBell size={20} />}
                    {notificationCount > 0 && (
                        <span className="notification-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>
                    )}
                </button>

                <div className="header-divider" />

                <div className="user-menu">
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
                    </button>

                    <Menu
                        anchorEl={userMenuAnchor}
                        open={!!userMenuAnchor}
                        onClose={() => setUserMenuAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: isRtl ? 'left' : 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: isRtl ? 'left' : 'right' }}
                        PaperProps={{ sx: { minWidth: 180, mt: 1.5 } }}
                    >
                        <MenuItem
                            disabled={isSettingsLocked}
                            onClick={() => { setUserMenuAnchor(null); navigate('/portal/settings'); }}
                        >
                            {isSettingsLocked
                                ? <HiOutlineLockClosed size={18} style={{ marginInlineEnd: 8 }} />
                                : <HiOutlineCog size={18} style={{ marginInlineEnd: 8 }} />}
                            {t('layout.header:menu.settings')}
                        </MenuItem>
                        <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                            <HiOutlineLogout size={18} style={{ marginInlineEnd: 8 }} /> {t('layout.header:menu.logout')}
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
