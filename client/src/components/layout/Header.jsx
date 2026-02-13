import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTheme, useMediaQuery, Box } from '@mui/material';
import { selectUser, logout } from '../../store/slices/authSlice';
import { selectTheme, setTheme, selectCurrentAcademicYear, toggleSidebar } from '../../store/slices/uiSlice';
import {
    HiOutlineMoon,
    HiOutlineSun,
    HiOutlineLogout,
    HiOutlineSearch,
    HiOutlineBell,
    HiOutlineMenu
} from 'react-icons/hi';
import './Header.css';

const Header = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const user = useSelector(selectUser);
    const theme = useSelector(selectTheme);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const muiTheme = useTheme();
    const isDesktop = useMediaQuery(muiTheme.breakpoints.up('md'));

    const handleLogout = () => {
        dispatch(logout());
        navigate('/');
    };

    const handleThemeToggle = () => {
        dispatch(setTheme(theme === 'dark' ? 'light' : 'dark'));
    };

    const handleMenuClick = () => {
        dispatch(toggleSidebar());
    };

    return (
        <header className="header">
            <div className="header-left">
                {/* Hamburger menu for mobile */}
                {!isDesktop && (
                    <button
                        className="header-btn hamburger-btn"
                        onClick={handleMenuClick}
                        aria-label="Open menu"
                    >
                        <HiOutlineMenu size={20} />
                    </button>
                )}
                
                {/* Search box - hidden on mobile */}
                <div className="search-box" style={{ display: isDesktop ? 'block' : 'none' }}>
                    <HiOutlineSearch className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search students, classes..."
                        className="search-input"
                    />
                </div>
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

                <button className="header-btn notification-btn">
                    <HiOutlineBell size={20} />
                    <span className="notification-badge">3</span>
                </button>

                <div className="header-divider" />

                <div className="user-menu">
                    <div className="user-avatar-sm">
                        {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                    </div>
                    <button
                        className="header-btn logout-btn"
                        onClick={handleLogout}
                        aria-label="Logout"
                    >
                        <HiOutlineLogout size={20} />
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Header;
