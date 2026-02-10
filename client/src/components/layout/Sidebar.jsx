import { NavLink } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../store/slices/authSlice';
import { selectSidebarOpen, toggleSidebar } from '../../store/slices/uiSlice';
import {
    HiOutlineHome,
    HiOutlineAcademicCap,
    HiOutlineUserGroup,
    HiOutlineBookOpen,
    HiOutlineClipboardList,
    HiOutlineChartBar,
    HiOutlineBell,
    HiOutlineCog,
    HiOutlineDocumentText,
    HiOutlineCalendar,
    HiOutlineClock,
    HiOutlineUsers,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineLightningBolt,
    HiOutlineClipboardCheck
} from 'react-icons/hi';
import './Sidebar.css';

const Sidebar = () => {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const sidebarOpen = useSelector(selectSidebarOpen);
    const isAdmin = user?.role === 'admin';
    const isTeacher = user?.role === 'teacher';
    const isStudent = user?.role === 'student';

    const navItems = [
        { path: '/portal/dashboard', icon: HiOutlineHome, label: 'Dashboard' },
        { path: '/portal/classes', icon: HiOutlineAcademicCap, label: 'Classes', roles: ['admin', 'teacher'] },
        { path: '/portal/students', icon: HiOutlineUserGroup, label: 'Students', roles: ['admin', 'teacher'] },
        { path: '/portal/my-schedule', icon: HiOutlineCalendar, label: 'My Schedule', teacher: true },
        { path: '/portal/my-timetable', icon: HiOutlineClock, label: 'My Timetable', teacher: true },
        { path: '/portal/my-attendance', icon: HiOutlineUsers, label: 'My Attendance', teacher: true },
        { path: '/portal/schedules', icon: HiOutlineCalendar, label: 'Schedule Management', admin: true },
        { path: '/portal/school-calendar', icon: HiOutlineCalendar, label: 'School Calendar', admin: true },
        { path: '/portal/timetable', icon: HiOutlineClock, label: 'Timetable', admin: true },
        { path: '/portal/attendance', icon: HiOutlineUsers, label: 'Attendance', admin: true },
        { path: '/portal/teachers', icon: HiOutlineChartBar, label: 'Teachers', admin: true },
        { path: '/portal/lessons', icon: HiOutlineDocumentText, label: 'Lesson Plans', roles: ['admin', 'teacher'] },
        { path: '/portal/grades/entry', icon: HiOutlineClipboardList, label: 'Grade Entry', roles: ['admin', 'teacher'] },
        { path: '/portal/subjects', icon: HiOutlineBookOpen, label: 'Subjects', admin: true },
        { path: '/portal/standards', icon: HiOutlineClipboardCheck, label: 'Standards', admin: true },
        { path: '/portal/standards/assign', icon: HiOutlineClipboardCheck, label: 'Assign Standards', roles: ['admin', 'teacher'] },
        { path: '/portal/practice', icon: HiOutlineLightningBolt, label: 'Practice', student: true },
        { path: '/portal/notifications', icon: HiOutlineBell, label: 'Notifications', roles: ['admin', 'teacher'] },
        { path: '/portal/settings', icon: HiOutlineCog, label: 'Settings' },
    ];

    const filteredNavItems = navItems.filter(item => {
        // If roles array is provided, check if user's role is included
        if (item.roles) return item.roles.includes(user?.role);
        if (item.admin && !isAdmin) return false;
        if (item.teacher && !isTeacher) return false;
        if (item.student && !isStudent) return false;
        return true;
    });

    return (
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
            {/* Logo */}
            <div className="sidebar-header">
                <div className="logo">
                    <div className="logo-icon">
                        <HiOutlineAcademicCap size={28} />
                    </div>
                    {sidebarOpen && <span className="logo-text">GradeBook</span>}
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
                {filteredNavItems.map((item) => (
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

            {/* User info */}
            {sidebarOpen && user && (
                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar">
                            {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                        </div>
                        <div className="user-details">
                            <span className="user-name">{user.firstName} {user.lastName}</span>
                            <span className="user-role">{user.role}</span>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
};

export default Sidebar;
