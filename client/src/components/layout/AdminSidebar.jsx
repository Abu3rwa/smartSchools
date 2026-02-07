import { NavLink } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser, logout } from '../../store/slices/authSlice';
import { selectSidebarOpen, toggleSidebar } from '../../store/slices/uiSlice';
import {
    HiOutlineHome,
    HiOutlineOfficeBuilding,
    HiOutlineUserGroup,
    HiOutlineCog,
    HiOutlineCreditCard,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineLogout,
    HiOutlineShieldCheck,
    HiOutlineAcademicCap,
    HiOutlineChartBar
} from 'react-icons/hi';
import './Sidebar.css';

const AdminSidebar = () => {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const sidebarOpen = useSelector(selectSidebarOpen);

    const navItems = [
        { path: '/admin/dashboard', icon: HiOutlineHome, label: 'Dashboard' },
        { path: '/admin/schools', icon: HiOutlineOfficeBuilding, label: 'Schools' },
        { path: '/admin/users', icon: HiOutlineUserGroup, label: 'Users' },
        { path: '/admin/subscriptions', icon: HiOutlineCreditCard, label: 'Subscriptions' },
        { path: '/admin/analytics', icon: HiOutlineChartBar, label: 'Analytics' },
        { path: '/admin/settings', icon: HiOutlineCog, label: 'Settings' },
    ];

    return (
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
            {/* Logo */}
            <div className="sidebar-header">
                <div className="logo">
                    <div className="logo-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                        <HiOutlineShieldCheck size={28} />
                    </div>
                    {sidebarOpen && <span className="logo-text" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Platform</span>}
                </div>
                <button
                    className="toggle-btn"
                    onClick={() => dispatch(toggleSidebar())}
                    aria-label="Toggle sidebar"
                >
                    {sidebarOpen ? <HiOutlineChevronLeft /> : <HiOutlineChevronRight />}
                </button>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `nav-item ${isActive ? 'active' : ''}`
                        }
                    >
                        <item.icon className="nav-icon" size={22} />
                        {sidebarOpen && <span className="nav-label">{item.label}</span>}
                    </NavLink>
                ))}
            </nav>

            {/* Footer */}
            {sidebarOpen && user && (
                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                            {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                        </div>
                        <div className="user-details">
                            <span className="user-name">{user.firstName} {user.lastName}</span>
                            <span className="user-role">Super Admin</span>
                        </div>
                    </div>
                    <button
                        className="nav-item"
                        onClick={() => dispatch(logout())}
                        style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', marginTop: 'var(--spacing-sm)' }}
                    >
                        <HiOutlineLogout className="nav-icon" size={22} />
                        <span className="nav-label">Logout</span>
                    </button>
                </div>
            )}
        </aside>
    );
};

export default AdminSidebar;
