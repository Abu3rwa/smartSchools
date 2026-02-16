import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { useTheme, useMediaQuery } from "@mui/material";
import { selectUser } from "../../store/slices/authSlice";
import {
  selectSidebarOpen,
  toggleSidebar,
  setSidebarOpen,
} from "../../store/slices/uiSlice";
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
  HiOutlineMenu,
  HiOutlineLightningBolt,
  HiOutlineClipboardCheck,
  HiOutlineOfficeBuilding,
} from "react-icons/hi";
import "./Sidebar.css";

const Sidebar = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const user = useSelector(selectUser);
  const sidebarOpen = useSelector(selectSidebarOpen);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const isAdmin = user?.role === "admin";
  const isTeacher = user?.role === "teacher";
  const isStudent = user?.role === "student";

  // Close drawer on mobile only when route changes (not when opening)
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    if (!isDesktop && prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      dispatch(setSidebarOpen(false));
    } else {
      prevPathRef.current = location.pathname;
    }
  }, [location.pathname, isDesktop, dispatch]);

  const SECTION_ORDER = [
    "overview",
    "teaching",
    "scheduling",
    "attendance",
    "school",
    "learning",
    "account",
  ];
  const SECTION_LABELS = {
    overview: "Overview",
    teaching: "Teaching",
    scheduling: "Scheduling",
    attendance: "Attendance",
    school: "School",
    learning: "Learning",
    account: "Account",
  };

  const navItems = [
    {
      path: "/portal/dashboard",
      icon: HiOutlineHome,
      label: "Dashboard",
      section: "overview",
    },
    {
      path: "/portal/classes",
      icon: HiOutlineAcademicCap,
      label: "Classes",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/students",
      icon: HiOutlineUserGroup,
      label: "Students",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/my-schedule",
      icon: HiOutlineCalendar,
      label: "My Schedule",
      teacher: true,
      section: "teaching",
    },
    {
      path: "/portal/my-timetable",
      icon: HiOutlineClock,
      label: "My Timetable",
      teacher: true,
      section: "teaching",
    },
    {
      path: "/portal/my-attendance",
      icon: HiOutlineUsers,
      label: "My Attendance",
      teacher: true,
      section: "teaching",
    },
    {
      path: "/portal/newsletters",
      icon: HiOutlineDocumentText,
      label: "Newsletters",
      teacher: true,
      section: "teaching",
    },
    {
      path: "/portal/newsletters/admin",
      icon: HiOutlineDocumentText,
      label: "Newsletters Review",
      admin: true,
      section: "teaching",
    },
    {
      path: "/portal/lessons",
      icon: HiOutlineDocumentText,
      label: "Lesson Plans",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/grades/entry",
      icon: HiOutlineClipboardList,
      label: "Grade Entry",
      roles: ["admin", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/standards",
      icon: HiOutlineClipboardCheck,
      label: "Standards",
      roles: ["admin", "teacher", "department_principal"],
      end: true,
      section: "teaching",
    },
    {
      path: "/portal/standards/assign",
      icon: HiOutlineClipboardCheck,
      label: "Assign Standards",
      roles: ["admin", "teacher", "department_principal"],
      section: "teaching",
    },
    {
      path: "/portal/schedules",
      icon: HiOutlineCalendar,
      label: "Schedule Management",
      roles: ["admin", "teacher", "department_principal"],
      section: "scheduling",
    },
    {
      path: "/portal/school-calendar",
      icon: HiOutlineCalendar,
      label: "School Calendar",
      roles: ["admin", "teacher", "department_principal"],
      section: "scheduling",
    },
    {
      path: "/portal/timetable",
      icon: HiOutlineClock,
      label: "Timetable",
      roles: ["admin", "teacher", "department_principal"],
      section: "scheduling",
    },
    {
      path: "/portal/attendance",
      icon: HiOutlineUsers,
      label: "Attendance",
      roles: ["admin", "teacher", "department_principal"],
      section: "attendance",
    },
    {
      path: "/portal/attendance-reminders",
      icon: HiOutlineBell,
      label: "Attendance Reminders",
      roles: ["admin", "department_principal"],
      section: "attendance",
    },
    {
      path: "/portal/attendance-requests",
      icon: HiOutlineClipboardList,
      label: "Attendance Requests",
      roles: ["admin", "department_principal", "teacher", "parent", "student"],
      section: "attendance",
    },
    {
      path: "/portal/review-attendance-requests",
      icon: HiOutlineClipboardCheck,
      label: "Attendance Tickets",
      roles: ["admin", "department_principal"],
      section: "attendance",
    },
    {
      path: "/portal/substitutions",
      icon: HiOutlineClipboardList,
      label: "Sub Requests",
      roles: ["admin", "department_principal", "teacher"],
      section: "attendance",
    },
    {
      path: "/portal/teachers",
      icon: HiOutlineChartBar,
      label: "Teachers",
      roles: ["admin", "department_principal"],
      section: "school",
    },
    {
      path: "/portal/school-settings",
      icon: HiOutlineOfficeBuilding,
      label: "School Settings",
      admin: true,
      section: "school",
    },
    {
      path: "/portal/subjects",
      icon: HiOutlineBookOpen,
      label: "Subjects",
      admin: true,
      section: "school",
    },
    {
      path: "/portal/reading/texts",
      icon: HiOutlineBookOpen,
      label: "Reading",
      roles: ["admin", "teacher"],
      section: "school",
    },
    {
      path: "/portal/my-grades",
      icon: HiOutlineClipboardList,
      label: "My Grades",
      roles: ["student"],
      section: "learning",
    },
    {
      path: "/portal/my-attendance",
      icon: HiOutlineClipboardCheck,
      label: "My Attendance",
      roles: ["student"],
      section: "learning",
    },
    {
      path: "/portal/practice",
      icon: HiOutlineLightningBolt,
      label: "Practice",
      roles: ["student"],
      section: "learning",
    },
    {
      path: "/portal/reading",
      icon: HiOutlineBookOpen,
      label: "Reading",
      roles: ["student"],
      section: "learning",
    },
    {
      path: "/portal/revision",
      icon: HiOutlineClipboardList,
      label: "Revision Plans",
      roles: ["student", "teacher", "admin"],
      section: "learning",
    },
    {
      path: "/portal/notifications",
      icon: HiOutlineBell,
      label: "Notifications",
      section: "account",
    },
    {
      path: "/portal/settings",
      icon: HiOutlineCog,
      label: "Settings",
      section: "account",
    },
  ];

  const filteredNavItems = navItems.filter((item) => {
    // If roles array is provided, check if user's role is included
    if (item.roles) return item.roles.includes(user?.role);
    if (item.admin && !isAdmin) return false;
    if (item.teacher && !isTeacher) return false;
    if (item.student && !isStudent) return false;
    return true;
  });

  // Group by section (preserve order), only include sections that have items
  const itemsBySection = SECTION_ORDER.reduce((acc, sectionKey) => {
    const items = filteredNavItems.filter(
      (item) => (item.section || "overview") === sectionKey,
    );
    if (items.length > 0) acc.push({ key: sectionKey, items });
    return acc;
  }, []);

  return (
    <aside className={`sidebar ${sidebarOpen ? "open" : "collapsed"}`}>
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
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? (
            <HiOutlineChevronLeft size={20} />
          ) : (
            <HiOutlineMenu size={24} />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {itemsBySection.map(({ key: sectionKey, items }, sectionIndex) => (
          <div key={sectionKey} className="sidebar-nav-section">
            {sidebarOpen && (
              <div className="sidebar-section-title">
                {SECTION_LABELS[sectionKey] || sectionKey}
              </div>
            )}
            {!sidebarOpen && sectionIndex > 0 && (
              <div className="sidebar-section-divider" />
            )}
            {items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end || false}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <item.icon className="nav-icon" size={22} />
                {sidebarOpen && <span className="nav-label">{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User info */}
      {sidebarOpen && user && (
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user.firstName?.charAt(0)}
              {user.lastName?.charAt(0)}
            </div>
            <div className="user-details">
              <span className="user-name">
                {user.firstName} {user.lastName}
              </span>
              <span className="user-role">{user.role}</span>
              {user.role === "department_principal" && (
                <span
                  className="scope-badge"
                  title={
                    user.department
                      ? "Viewing only your department"
                      : "Viewing all school data"
                  }
                >
                  {user.department?.name
                    ? `Department: ${user.department.name}`
                    : "Whole-school principal"}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
