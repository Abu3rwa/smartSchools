import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTheme, useMediaQuery, Box, Menu, MenuItem } from '@mui/material';
import { selectUser, logout } from '../../store/slices/authSlice';
import { selectTheme, setTheme, selectCurrentAcademicYear, toggleSidebar } from '../../store/slices/uiSlice';
import {
    HiOutlineMoon,
    HiOutlineSun,
    HiOutlineLogout,
    HiOutlineSearch,
    HiOutlineBell,
    HiOutlineMenu,
    HiOutlineCog
} from 'react-icons/hi';
import notificationService from '../../services/notificationService';
import './Header.css';

const Header = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const user = useSelector(selectUser);
    const theme = useSelector(selectTheme);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const muiTheme = useTheme();
    const isDesktop = useMediaQuery(muiTheme.breakpoints.up('md'));

    const [searchTerm, setSearchTerm] = useState('');
    const [notificationCount, setNotificationCount] = useState(0);
    const [userMenuAnchor, setUserMenuAnchor] = useState(null);

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

    const handleSearch = (e) => {
        e?.preventDefault?.();
        const term = searchTerm.trim();
        if (term) {
            navigate(`/portal/students?search=${encodeURIComponent(term)}`);
        } else {
            navigate('/portal/students');
        }
    };

    const handleNotificationClick = () => {
        navigate('/portal/notifications');
    };

    return (
        <header className="header">
            <div className="header-left">
                {!isDesktop && (
                    <button
                        className="header-btn hamburger-btn"
                        onClick={handleMenuClick}
                        aria-label="Open menu"
                    >
                        <HiOutlineMenu size={20} />
                    </button>
                )}

                <form className="search-box" style={{ display: isDesktop ? 'block' : 'none' }} onSubmit={handleSearch}>
                    <HiOutlineSearch className="search-icon" aria-hidden />
                    <input
                        type="text"
                        placeholder="Search students..."
                        className="search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        aria-label="Search students"
                    />
                </form>
            </div>

            <div className="header-right">
                <div className="academic-year">
                    <span className="badge badge-primary">{academicYear}</span>
                </div>

                <button
                    className="header-btn"
                    onClick={handleThemeToggle}
                    aria-label="Toggle theme"
                >
                    {theme === 'dark' ? <HiOutlineSun size={20} /> : <HiOutlineMoon size={20} />}
                </button>

                <button
                    className="header-btn notification-btn"
                    onClick={handleNotificationClick}
                    aria-label={`Notifications${notificationCount > 0 ? ` (${notificationCount} pending)` : ''}`}
                >
                    <HiOutlineBell size={20} />
                    {notificationCount > 0 && (
                        <span className="notification-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>
                    )}
                </button>

                <div className="header-divider" />

                <div className="user-menu">
                    <button
                        className="header-btn user-avatar-btn"
                        onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                        aria-label="User menu"
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
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                        PaperProps={{ sx: { minWidth: 180, mt: 1.5 } }}
                    >
                        <MenuItem onClick={() => { setUserMenuAnchor(null); navigate('/portal/settings'); }}>
                            <HiOutlineCog size={18} style={{ marginRight: 8 }} /> Settings
                        </MenuItem>
                        <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                            <HiOutlineLogout size={18} style={{ marginRight: 8 }} /> Logout
                        </MenuItem>
                    </Menu>
                </div>
            </div>
        </header>
    );
};

export default Header;
