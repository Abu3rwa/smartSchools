import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTheme, useMediaQuery } from '@mui/material';
import { Drawer } from '@mui/material';
import { selectSidebarOpen, setSidebarOpen } from '../../store/slices/uiSlice';
import { selectIsImpersonating, stopImpersonation, selectUser } from '../../store/slices/authSlice';
import AdminSidebar from './AdminSidebar';
import Header from './Header';
import { HiOutlineLogout, HiOutlineExclamation } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './MainLayout.css';

const ImpersonationBanner = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const impersonatedUser = useSelector(selectUser);

    const handleStopImpersonating = async () => {
        const toastId = toast.loading('Returning to admin view...');
        try {
            await dispatch(stopImpersonation()).unwrap();
            toast.success('Returned to Super Admin account', { id: toastId });
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
            <span>You are currently impersonating <strong>{impersonatedUser?.fullName || impersonatedUser?.email}</strong>.</span>
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
                Exit Impersonation
            </button>
        </div>
    );
};

const AdminLayout = () => {
    const dispatch = useDispatch();
    const sidebarOpen = useSelector(selectSidebarOpen);
    const isImpersonating = useSelector(selectIsImpersonating);
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

    const isRtl = theme.direction === 'rtl';

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
        <div className={`main-layout admin-layout ${sidebarOpen && isDesktop ? '' : 'sidebar-collapsed'}`}>
            <a href="#main-content" className="skip-link">Skip to main content</a>
            {/* Desktop: Persistent sidebar */}
            {isDesktop && <AdminSidebar />}
            
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
                    <AdminSidebar />
                </Drawer>
            )}

            <div className="main-content">
                {isImpersonating && <ImpersonationBanner />}
                <Header />
<main id="main-content" className="page-content">
                <Outlet />
            </main>
            </div>
        </div>
    );
};

export default AdminLayout;
