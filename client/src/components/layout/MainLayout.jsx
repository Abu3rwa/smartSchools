import { useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTheme, useMediaQuery } from '@mui/material';
import { Drawer } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { selectSidebarOpen, setSidebarOpen } from '../../store/slices/uiSlice';
import { selectUser } from '../../store/slices/authSlice';
import { selectSubscriptionStatus } from '../../store/slices/schoolFeaturesSlice';
import useAppData from '../../hooks/useAppData';
import Sidebar from './Sidebar';
import Header from './Header';
import SubscriptionExpiredWall from '../SubscriptionExpiredWall';
import SubscriptionExpiredBanner from '../SubscriptionExpiredBanner';
import SchoolPageAccessGate from '../SchoolPageAccessGate';
import StudentLiveLessonPopup from '../liveLessons/StudentLiveLessonPopup';
import './MainLayout.css';

const MainLayout = () => {
    const dispatch = useDispatch();
    const location = useLocation();
    const { i18n, t } = useTranslation(['common']);

    useAppData();

    const sidebarOpen = useSelector(selectSidebarOpen);
    const user = useSelector(selectUser);
    const subscriptionStatus = useSelector(selectSubscriptionStatus);
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    const isRtl = i18n.dir() === 'rtl';
    const isStudent = user?.role === 'student';
    const showSidebarForRole = Boolean(user) && !isStudent;
    const normalizedStatus = String(subscriptionStatus || '').toLowerCase();
    const isExpired = ['inactive', 'cancelled', 'suspended', 'expired'].includes(normalizedStatus);
    const shouldShowWall = isExpired
        && user?.role === 'admin'
        && !['/portal/settings', '/portal/settings/subscription', '/portal/school-settings'].includes(location.pathname);
    const shouldShowBanner = isExpired && ['teacher', 'student'].includes(user?.role);

    // Keep sidebar/drawer closed by default on small screens
    useEffect(() => {
        if (!isDesktop) {
            dispatch(setSidebarOpen(false));
        }
    }, [isDesktop, dispatch]);

    const handleDrawerClose = useCallback(() => {
        dispatch(setSidebarOpen(false));
    }, [dispatch]);

    return (
        <div className={`main-layout${isStudent ? ' student-layout' : ''} ${sidebarOpen && isDesktop && showSidebarForRole ? '' : 'sidebar-collapsed'}`}>
            <a href="#main-content" className="skip-link">{t('common:accessibility.skipToMainContent')}</a>
            {/* Desktop: Persistent sidebar */}
            {isDesktop && showSidebarForRole && <Sidebar />}
            
            {/* Mobile: Drawer sidebar */}
            {!isDesktop && sidebarOpen && showSidebarForRole && (
                <Drawer
                    variant="temporary"
                    anchor={isRtl ? 'right' : 'left'}
                    open
                    onClose={handleDrawerClose}
                    ModalProps={{
                        keepMounted: false,
                    }}
                    sx={{
                        display: { xs: 'block', md: 'none' },
                        '& .MuiDrawer-paper': {
                            width: 'min(320px, 85vw)',
                            boxSizing: 'border-box',
                            background: 'var(--bg-secondary)',
                            borderInlineEnd: '1px solid var(--border-color)',
                        },
                    }}
                >
                    <Sidebar />
                </Drawer>
            )}

            <div className="main-content">
                <div className="bg-grid-inset" aria-hidden="true" />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <Header />
                    <main id="main-content" className="page-content">
                        {shouldShowBanner && <SubscriptionExpiredBanner />}
                        <SchoolPageAccessGate>
                            <Outlet />
                        </SchoolPageAccessGate>
                    </main>
                </div>
            </div>
            {isStudent &&
                import.meta.env.VITE_LIVE_LESSONS_ENABLED === 'true' && (
                    <StudentLiveLessonPopup />
                )}
            {shouldShowWall && <SubscriptionExpiredWall />}
        </div>
    );
};

export default MainLayout;
