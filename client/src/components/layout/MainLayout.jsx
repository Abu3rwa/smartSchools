import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTheme, useMediaQuery, Box } from '@mui/material';
import { Drawer } from '@mui/material';
import { selectSidebarOpen, setSidebarOpen } from '../../store/slices/uiSlice';
import Sidebar from './Sidebar';
import Header from './Header';
import './MainLayout.css';

const MainLayout = () => {
    const dispatch = useDispatch();
    const sidebarOpen = useSelector(selectSidebarOpen);
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

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
            {/* Desktop: Persistent sidebar */}
            {isDesktop && <Sidebar />}
            
            {/* Mobile: Drawer sidebar */}
            {!isDesktop && (
                <Drawer
                    variant="temporary"
                    anchor="left"
                    open={sidebarOpen}
                    onClose={handleDrawerClose}
                    ModalProps={{
                        keepMounted: true, // Better mobile performance
                    }}
                    sx={{
                        display: { xs: 'block', md: 'none' },
                        '& .MuiDrawer-paper': {
                            width: 'min(320px, 85vw)',
                            boxSizing: 'border-box',
                            background: 'var(--bg-secondary)',
                            borderRight: '1px solid var(--border-color)',
                        },
                    }}
                >
                    <Sidebar />
                </Drawer>
            )}

            <div className="main-content">
                <Header />
                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
