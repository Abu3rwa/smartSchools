import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { useTheme, useMediaQuery } from "@mui/material";
import { selectUser } from "../../store/slices/authSlice";
import { fetchMessageThreads } from "../../api/messagesApi";
import {
  selectSidebarOpen,
  toggleSidebar,
  setSidebarOpen,
  selectAppName,
} from "../../store/slices/uiSlice";
import { selectSchoolFeatures } from "../../store/slices/schoolFeaturesSlice";
import { PERMISSIONS } from "../../constants/permissions";
import {
  HiOutlineHome,
  HiOutlineAcademicCap,
  HiOutlineUserGroup,
  HiOutlineBookOpen,
  HiOutlineClipboardList,
  HiOutlineChartBar,
  HiOutlineBell,
  HiOutlineChatAlt2,
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
  HiOutlineExclamationCircle,
  HiOutlineLockClosed,
  HiOutlineMail,
} from "react-icons/hi";
import "./Sidebar.css";

const Sidebar = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const { t, i18n } = useTranslation(["layout.sidebar"]);
  const user = useSelector(selectUser);
  const sidebarOpen = useSelector(selectSidebarOpen);
  const appName = useSelector(selectAppName);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const isAdmin = user?.role === "admin";
  const isTeacher = user?.role === "teacher";
  const isStudent = user?.role === "student";
  const schoolFeatures = useSelector(selectSchoolFeatures);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const isRtl = i18n.dir() === "rtl";

  const canSeeMessages = useMemo(() => {
    return ["admin", "teacher", "department_principal", "staff"].includes(
      user?.role,
    );
  }, [user?.role]);

  // Helper function to check if user has permission
  const hasPermission = (permission) => {
    if (!user) return false;
    // Super admin and admin have all permissions
    if (user.role === "super_admin" || user.role === "admin") return true;
    // Check if user has the permission
    return user.permissions?.includes(permission) ?? false;
  };

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

  useEffect(() => {
    if (!canSeeMessages) {
      setMessageUnreadCount(0);
      return undefined;
    }

    let isMounted = true;

    const loadUnreadCount = async () => {
      try {
        const data = await fetchMessageThreads({ page: 1, limit: 1 });
        if (isMounted) {
          setMessageUnreadCount(data?.unreadCount || 0);
        }
      } catch (error) {
        if (isMounted) {
          setMessageUnreadCount(0);
        }
      }
    };

    loadUnreadCount();
    const intervalId = window.setInterval(loadUnreadCount, 60000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [canSeeMessages]);

  const SECTION_ORDER = [
    "overview",
    "teaching",
    "scheduling",
    "attendance",
    "school",
    "learning",
    "account",
  ];

  const navItems = [
    {
      path: "/portal/dashboard",
      icon: HiOutlineHome,
      labelKey: "dashboard",
      section: "overview",
    },
    {
      path: "/portal/notifications",
      icon: HiOutlineBell,
      labelKey: "notifications",
      section: "overview",
    },
    {
      path: "/portal/messages",
      icon: HiOutlineChatAlt2,
      labelKey: "messages",
      roles: ["admin", "teacher", "department_principal", "staff"],
      section: "overview",
      badgeCount: messageUnreadCount,
    },
    {
      path: "/portal/email-composer",
      icon: HiOutlineMail,
      labelKey: "emailComposer",
      roles: ["admin", "teacher", "department_principal", "staff"],
      permissions: [PERMISSIONS.SEND_COMMUNICATION_EMAILS, PERMISSIONS.SEND_NOTIFICATIONS],
      section: "overview",
    },
    {
      path: "/portal/my-schedule",
      icon: HiOutlineCalendar,
      labelKey: "mySchedule",
      teacher: true,
      section: "teaching",
    },
    {
      path: "/portal/my-timetable",
      icon: HiOutlineClock,
      labelKey: "myTimetable",
      teacher: true,
      section: "teaching",
    },
    {
      path: "/portal/my-attendance",
      icon: HiOutlineUsers,
      labelKey: "myAttendance",
      teacher: true,
      section: "teaching",
    },
    {
      path: "/portal/classes",
      icon: HiOutlineAcademicCap,
      labelKey: "classes",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/students",
      icon: HiOutlineUserGroup,
      labelKey: "students",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/lessons",
      icon: HiOutlineDocumentText,
      labelKey: "lessonPlans",
      roles: ["admin", "department_principal", "teacher"],
      permissions: [
        PERMISSIONS.EDIT_LESSON_PLANS,
        PERMISSIONS.REVIEW_LESSON_PLANS,
      ],
      section: "teaching",
    },
    {
      path: "/portal/assignments",
      icon: HiOutlineClipboardList,
      labelKey: "assignments",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/grades/entry",
      icon: HiOutlineClipboardList,
      labelKey: "gradeEntry",
      roles: ["admin", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/gradebook",
      icon: HiOutlineChartBar,
      labelKey: "gradebook",
      roles: ["admin", "teacher", "department_principal"],
      section: "teaching",
    },
    {
      path: "/portal/standards",
      icon: HiOutlineClipboardCheck,
      labelKey: "standards",
      roles: ["admin", "teacher", "department_principal"],
      feature: "standardsPractice",
      end: true,
      section: "teaching",
    },
    {
      path: "/portal/standards/assign",
      icon: HiOutlineClipboardCheck,
      labelKey: "assignStandards",
      roles: ["admin", "teacher", "department_principal"],
      feature: "standardsPractice",
      section: "teaching",
    },
    {
      path: "/portal/standards/gradebook",
      icon: HiOutlineChartBar,
      labelKey: "standardsGradebook",
      roles: ["admin", "teacher", "department_principal"],
      feature: "standardsPractice",
      section: "teaching",
    },
    {
      path: "/portal/curriculum",
      icon: HiOutlineBookOpen,
      labelKey: "curriculumPlanning",
      roles: ["admin", "teacher", "department_principal"],
      permissions: [
        PERMISSIONS.VIEW_CURRICULUM_MAPS,
        PERMISSIONS.EDIT_CURRICULUM_MAPS,
        PERMISSIONS.REVIEW_CURRICULUM_MAPS,
        PERMISSIONS.PUBLISH_CURRICULUM_MAPS,
        PERMISSIONS.CREATE_CURRICULUM_MAP,
        PERMISSIONS.EDIT_OWN_CURRICULUM_MAP,
        PERMISSIONS.EDIT_ANY_CURRICULUM_MAP,
        PERMISSIONS.REVIEW_CURRICULUM_MAP,
        PERMISSIONS.APPROVE_CURRICULUM_MAP,
        PERMISSIONS.REJECT_CURRICULUM_MAP,
        PERMISSIONS.EXPORT_CURRICULUM_MAP,
        PERMISSIONS.PRINT_CURRICULUM_MAP,
        PERMISSIONS.CONFIGURE_CURRICULUM_MAP_TEMPLATES,
      ],
      section: "teaching",
    },
    {
      path: "/portal/interventions",
      icon: HiOutlineExclamationCircle,
      labelKey: "interventions",
      roles: ["admin", "teacher", "department_principal"],
      feature: "interventionTracking",
      section: "teaching",
    },
    {
      path: "/portal/newsletters",
      icon: HiOutlineDocumentText,
      labelKey: "newsletters",
      teacher: true,
      feature: "newsletterCommunication",
      section: "teaching",
    },
    {
      path: "/portal/newsletters/admin",
      icon: HiOutlineDocumentText,
      labelKey: "newslettersReview",
      admin: true,
      feature: "newsletterCommunication",
      section: "teaching",
    },
    {
      path: "/portal/newsletters/history",
      icon: HiOutlineDocumentText,
      labelKey: "newsletters",
      roles: ["parent"],
      feature: "newsletterCommunication",
      section: "learning",
    },
    {
      path: "/portal/schedules",
      icon: HiOutlineCalendar,
      labelKey: "scheduleManagement",
      roles: ["admin"],
      section: "scheduling",
    },
    {
      path: "/portal/timetable",
      icon: HiOutlineClock,
      labelKey: "timetable",
      roles: ["admin", "teacher", "department_principal"],
      section: "scheduling",
    },
    {
      path: "/portal/school-calendar",
      icon: HiOutlineCalendar,
      labelKey: "schoolCalendar",
      roles: ["admin", "department_principal", "teacher"],
      permissions: [PERMISSIONS.MANAGE_EVENTS],
      section: "scheduling",
    },
    {
      path: "/portal/attendance",
      icon: HiOutlineUsers,
      labelKey: "attendance",
      roles: ["admin", "department_principal"],
      section: "attendance",
    },
    {
      path: "/portal/attendance-requests",
      icon: HiOutlineClipboardList,
      labelKey: "attendanceRequests",
      roles: ["admin", "department_principal", "teacher", "parent", "student"],
      section: "attendance",
    },
    {
      path: "/portal/review-attendance-requests",
      icon: HiOutlineClipboardCheck,
      labelKey: "attendanceTickets",
      roles: ["admin", "department_principal"],
      section: "attendance",
    },
    {
      path: "/portal/attendance-reminders",
      icon: HiOutlineBell,
      labelKey: "attendanceReminders",
      roles: ["admin"],
      section: "attendance",
    },
    {
      path: "/portal/substitutions",
      icon: HiOutlineClipboardList,
      labelKey: "subRequests",
      roles: ["admin", "department_principal", "teacher"],
      section: "attendance",
    },
    {
      path: "/portal/behavior",
      icon: HiOutlineClipboardCheck,
      labelKey: "behaviorManagement",
      roles: ["admin", "department_principal", "teacher"],
      permissions: [PERMISSIONS.MANAGE_BEHAVIOR, PERMISSIONS.VIEW_BEHAVIOR],
      section: "attendance",
    },
    {
      path: "/portal/behavior-analytics",
      icon: HiOutlineChartBar,
      labelKey: "behaviorAnalytics",
      roles: ["admin", "department_principal", "super_admin"],
      section: "attendance",
    },
    {
      path: "/portal/teachers",
      icon: HiOutlineChartBar,
      labelKey: "teachers",
      roles: ["admin", "department_principal"],
      section: "school",
    },
    {
      path: "/portal/subjects",
      icon: HiOutlineBookOpen,
      labelKey: "subjects",
      roles: ["teacher"],
      section: "school",
    },
    {
      path: "/portal/reading/texts",
      icon: HiOutlineBookOpen,
      labelKey: "reading",
      roles: ["admin", "teacher"],
      feature: "readingAssistant",
      section: "teaching",
    },
    {
      path: "/portal/school-settings",
      icon: HiOutlineOfficeBuilding,
      labelKey: "schoolSettings",
      admin: true,
      section: "school",
    },
    {
      path: "/portal/api-docs",
      icon: HiOutlineDocumentText,
      labelKey: "apiDocumentation",
      admin: true,
      feature: "apiAccess",
      section: "school",
    },
    {
      path: "/portal/my-grades",
      icon: HiOutlineClipboardList,
      labelKey: "myGrades",
      roles: ["student"],
      section: "learning",
    },
    {
      path: "/portal/student-attendance",
      icon: HiOutlineClipboardCheck,
      labelKey: "myAttendance",
      roles: ["student"],
      section: "learning",
    },
    {
      path: "/portal/practice",
      icon: HiOutlineLightningBolt,
      labelKey: "practice",
      roles: ["student"],
      section: "learning",
    },
    {
      path: "/portal/practice/sb-results",
      icon: HiOutlineChartBar,
      labelKey: "sbResults",
      roles: ["student"],
      section: "learning",
    },
    {
      path: "/portal/reading",
      icon: HiOutlineBookOpen,
      labelKey: "reading",
      roles: ["student"],
      feature: "readingAssistant",
      section: "learning",
    },
    {
      path: "/portal/revision",
      icon: HiOutlineClipboardList,
      labelKey: "revisionPlans",
      roles: ["student", "teacher", "admin"],
      feature: "revisionPlanning",
      section: "learning",
    },
    {
      path: "/portal/settings",
      icon: HiOutlineCog,
      labelKey: "settings",
      section: "account",
    },
  ];

  const filteredNavItems = navItems.filter((item) => {
    // Check role-based access first
    let hasRoleAccess = true;
    if (item.roles) {
      hasRoleAccess = item.roles.includes(user?.role);
    } else if (item.admin && !isAdmin) {
      hasRoleAccess = false;
    } else if (item.teacher && !isTeacher) {
      hasRoleAccess = false;
    } else if (item.student && !isStudent) {
      hasRoleAccess = false;
    }

    // If permissions are specified, check if user has at least one
    if (item.permissions && item.permissions.length > 0) {
      const hasRequiredPermission = item.permissions.some((permission) =>
        hasPermission(permission),
      );
      // User needs either role access OR permission access
      return hasRoleAccess || hasRequiredPermission;
    }

    return hasRoleAccess;
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
            <img src="/logo.svg" alt="Logo" width={55} height={55} />
          </div>
          {sidebarOpen && <span className="logo-text">{appName}</span>}
        </div>
        <button
          className="toggle-btn"
          onClick={() => dispatch(toggleSidebar())}
          aria-label={
            sidebarOpen
              ? t("layout.sidebar:actions.collapseSidebar")
              : t("layout.sidebar:actions.expandSidebar")
          }
        >
          {sidebarOpen ? (
            isRtl ? <HiOutlineChevronRight size={20} /> : <HiOutlineChevronLeft size={20} />
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
                {t(`layout.sidebar:sections.${sectionKey}`)}
              </div>
            )}
            {!sidebarOpen && sectionIndex > 0 && (
              <div className="sidebar-section-divider" />
            )}
            {items.map((item) => {
              const isLocked = item.feature && schoolFeatures?.[item.feature] === false;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end || false}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""} ${isLocked ? "locked" : ""}`
                  }
                >
                  <item.icon className="nav-icon" size={20} />
                  {sidebarOpen && (
                    <span className="nav-label">{t(`layout.sidebar:items.${item.labelKey}`)}</span>
                  )}
                  {isLocked && sidebarOpen && (
                    <HiOutlineLockClosed className="nav-feature-lock" size={14} />
                  )}
                  {/* {isLocked && sidebarOpen && (
                    <span className="nav-badge nav-badge-upgrade">
                      {t("layout.sidebar:actions.upgrade")}
                    </span>
                  )} */}
                  {isLocked && !sidebarOpen && (
                    <span className="nav-lock-dot" aria-label={t("layout.sidebar:actions.featureLocked")}>
                      <HiOutlineLockClosed size={10} />
                    </span>
                  )}
                  {!!item.badgeCount && item.badgeCount > 0 && (
                    <span className="nav-badge">{item.badgeCount}</span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User info */}
      {/* {sidebarOpen && user && (
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
      )} */}
    </aside>
  );
};

export default Sidebar;
