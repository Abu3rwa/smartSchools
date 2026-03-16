import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTheme, useMediaQuery } from '@mui/material';
import { Drawer } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { selectSidebarOpen, setSidebarOpen } from '../../store/slices/uiSlice';
import { selectIsImpersonating, stopImpersonation, selectUser } from '../../store/slices/authSlice';
import { selectSubscriptionStatus } from '../../store/slices/schoolFeaturesSlice';
import Sidebar from './Sidebar';
import Header from './Header';
import SubscriptionExpiredWall from '../SubscriptionExpiredWall';
import SubscriptionExpiredBanner from '../SubscriptionExpiredBanner';
import './MainLayout.css';
import { HiOutlineLogout, HiOutlineExclamation } from 'react-icons/hi';
import toast from 'react-hot-toast';

const ImpersonationBanner = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t } = useTranslation(['common']);
    const impersonatedUser = useSelector(selectUser); // This is the user being impersonated

    const handleStopImpersonating = async () => {
        const toastId = toast.loading(t('common:impersonation.returningToAdmin'));
        try {
            await dispatch(stopImpersonation()).unwrap();
            toast.success(t('common:impersonation.returnedToSuperAdmin'), { id: toastId });
            navigate('/admin/schools');
        } catch (error) {
            toast.error(error, { id: toastId });
        }
    };

    return (
        <div style={{
            background: 'var(--warning-bg)',
            color: 'var(--warning-text)',
            padding: 'var(--spacing-sm) var(--spacing-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--spacing-md)',
            fontSize: '0.9rem',
            fontWeight: 500,
            borderBottom: '1px solid var(--warning-border)',
        }}>
            <HiOutlineExclamation size={18} />
            <span>
                {t('common:impersonation.currentlyImpersonating')}{' '}
                <strong>{impersonatedUser?.fullName || impersonatedUser?.email}</strong>.
            </span>
            <button
                onClick={handleStopImpersonating}
                style={{
                    background: 'none',
                    border: '1px solid currentColor',
                    color: 'currentColor',
                    borderRadius: 'var(--radius-sm)',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 600,
                }}
            >
                <HiOutlineLogout size={14} />
                {t('common:impersonation.exitImpersonation')}
            </button>
        </div>
    );
};

const MainLayout = () => {
    const dispatch = useDispatch();
    const location = useLocation();
    const { i18n, t } = useTranslation(['common']);
    const sidebarOpen = useSelector(selectSidebarOpen);
    const isImpersonating = useSelector(selectIsImpersonating);
    const user = useSelector(selectUser);
    const subscriptionStatus = useSelector(selectSubscriptionStatus);
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    const isRtl = i18n.dir() === 'rtl';
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

    const handleDrawerClose = () => {
        dispatch(setSidebarOpen(false));
    };

    return (
        <div className={`main-layout ${sidebarOpen && isDesktop ? '' : 'sidebar-collapsed'}`}>
            <a href="#main-content" className="skip-link">{t('common:accessibility.skipToMainContent')}</a>
            {/* Desktop: Persistent sidebar */}
            {isDesktop && <Sidebar />}
            
            {/* Mobile: Drawer sidebar */}
            {!isDesktop && sidebarOpen && (
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
                    {isImpersonating && <ImpersonationBanner />}
                    <Header />
                    <main id="main-content" className="page-content">
                        {shouldShowBanner && <SubscriptionExpiredBanner />}
                        <Outlet />
                    </main>
                </div>
            </div>
            {shouldShowWall && <SubscriptionExpiredWall />}
        </div>
    );
};

export default MainLayout;
