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
import {
  fetchSubPendingCountThunk,
  selectPendingCount,
} from "../../store/slices/substitutionsSlice";
import { PERMISSIONS } from "../../constants/permissions";
import {
  HiOutlineHome,
  HiOutlineBell,
  HiOutlineChatBubbleLeftRight,
  HiOutlineEnvelope,
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlineUserCircle,
  HiOutlineRectangleGroup,
  HiOutlineUsers,
  HiOutlineArrowPathRoundedSquare,
  HiOutlineDocumentText,
  HiOutlinePencilSquare,
  HiOutlinePlusCircle,
  HiOutlineTableCells,
  HiOutlineCheckBadge,
  HiOutlineLink,
  HiOutlineChartBar,
  HiOutlineBookOpen,
  HiOutlineLifebuoy,
  HiOutlineSparkles,
  HiOutlineArrowTrendingUp,
  HiOutlineNewspaper,
  HiOutlineDocumentCheck,
  HiOutlineAdjustmentsHorizontal,
  HiOutlinePrinter,
  HiOutlineDocumentChartBar,
  HiOutlineCalendar,
  HiOutlineInboxArrowDown,
  HiOutlineTicket,
  HiOutlineMegaphone,
  HiOutlineUserPlus,
  HiOutlineFaceSmile,
  HiOutlineChartPie,
  HiOutlineIdentification,
  HiOutlineTag,
  HiOutlineBuildingOffice,
  HiOutlineCreditCard,
  HiOutlineCommandLine,
  HiOutlineAcademicCap,
  HiOutlineClipboardDocumentCheck,
  HiOutlineCheckCircle,
  HiOutlineStar,
  HiOutlineRectangleStack,
  HiOutlineArrowPath,
  HiOutlineCog6Tooth,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineBars3,
  HiOutlineLockClosed,
  HiOutlinePresentationChartBar,
  HiOutlineBanknotes,
  HiOutlineCalculator,
  HiOutlineReceiptPercent,
  HiOutlineDocumentCurrencyDollar,
  HiOutlineUserGroup,
  HiOutlineBriefcase,
  HiOutlineSparkles as HiOutlinePLP,
  HiOutlineTrophy,
  HiOutlineCog6Tooth as HiOutlinePLPConfig,
} from "react-icons/hi2";import "./Sidebar.css";

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
  const pendingSubCount = useSelector(selectPendingCount);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const isRtl = i18n.dir() === "rtl";

  const canSeeMessages = useMemo(() => {
    return ["admin", "teacher", "department_principal", "staff"].includes(
      user?.role,
    );
  }, [user?.role]);
  const displayUnreadCount = canSeeMessages ? messageUnreadCount : 0;

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
      return undefined;
    }

    let isMounted = true;

    const loadUnreadCount = async () => {
      try {
        const data = await fetchMessageThreads({ page: 1, limit: 1 });
        if (isMounted) {
          setMessageUnreadCount(data?.unreadCount || 0);
        }
      } catch {
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

  useEffect(() => {
    if (!isTeacher) return undefined;

    dispatch(fetchSubPendingCountThunk());
    const intervalId = window.setInterval(() => {
      dispatch(fetchSubPendingCountThunk());
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [dispatch, isTeacher]);

  const SECTION_ORDER = [
    "overview",
    "communication",
    "teaching",
    "assessment",
    "support",
    "operations",
    "finance",
    "hr",
    "plp",
    "insights",
    "admin",
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
      roles: ["admin", "teacher", "department_principal", "staff"],
      section: "overview",
    },
    {
      path: "/portal/messages",
      icon: HiOutlineChatBubbleLeftRight,
      labelKey: "messages",
      roles: ["admin", "teacher", "department_principal", "staff"],
      section: "communication",
      badgeCount: displayUnreadCount,
    },
    {
      path: "/portal/email-composer",
      icon: HiOutlineEnvelope,
      labelKey: "emailComposer",
      roles: ["admin", "teacher", "department_principal", "staff"],
      permissions: [
        PERMISSIONS.SEND_COMMUNICATION_EMAILS,
        PERMISSIONS.SEND_NOTIFICATIONS,
      ],
      section: "communication",
    },
    {
      path: "/portal/my-schedule",
      icon: HiOutlineCalendarDays,
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
      icon: HiOutlineUserCircle,
      labelKey: "myAttendance",
      teacher: true,
      section: "teaching",
    },
    {
      path: "/portal/classes",
      icon: HiOutlineRectangleGroup,
      labelKey: "classes",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/students",
      icon: HiOutlineUsers,
      labelKey: "students",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/students/promotion-center",
      icon: HiOutlineArrowPathRoundedSquare,
      labelKey: "promotionCenter",
      admin: true,
      section: "assessment",
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
      icon: HiOutlinePencilSquare,
      labelKey: "assignments",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/grades/entry",
      icon: HiOutlinePlusCircle,
      labelKey: "gradeEntry",
      roles: ["admin", "teacher"],
      section: "assessment",
    },
    {
      path: "/portal/gradebook",
      icon: HiOutlineTableCells,
      labelKey: "gradebook",
      roles: ["admin", "teacher", "department_principal"],
      section: "assessment",
    },
    {
      path: "/portal/standards",
      icon: HiOutlineCheckBadge,
      labelKey: "standards",
      roles: ["admin", "teacher", "department_principal"],
      feature: "standardsPractice",
      end: true,
      section: "assessment",
    },
    {
      path: "/portal/grammar-assessments",
      icon: HiOutlineClipboardDocumentCheck,
      labelKey: "grammarAssessments",
      roles: ["admin", "teacher", "department_principal"],
      feature: "standardsPractice",
      section: "assessment",
    },
    // Social Studies — teacher
    {
      path: "/portal/social-studies",
      icon: HiOutlineBookOpen,
      labelKey: "socialStudies",
      roles: ["admin", "teacher", "department_principal"],
      feature: "socialStudies",
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
      icon: HiOutlineLifebuoy,
      labelKey: "interventions",
      roles: ["admin", "teacher", "department_principal"],
      feature: "interventionTracking",
      section: "support",
    },
    {
      path: "/portal/teacher-academic-excellence",
      icon: HiOutlineSparkles,
      labelKey: "academicExcellenceTeacher",
      roles: ["admin", "teacher", "department_principal"],
      feature: "academicIntelligence",
      section: "insights",
    },
    {
      path: "/portal/student-grouping",
      icon: HiOutlineRectangleStack,
      labelKey: "studentGrouping",
      roles: ["admin", "teacher", "department_principal"],
      feature: "academicIntelligence",
      section: "insights",
    },
    {
      path: "/portal/admin-academic-excellence",
      icon: HiOutlineArrowTrendingUp,
      labelKey: "academicExcellenceAnalytics",
      roles: ["admin", "department_principal"],
      feature: "academicIntelligence",
      section: "insights",
    },
    {
      path: "/portal/newsletters",
      icon: HiOutlineNewspaper,
      labelKey: "newsletters",
      teacher: true,
      feature: "newsletterCommunication",
      section: "communication",
    },
    {
      path: "/portal/presentations",
      icon: HiOutlinePresentationChartBar,
      labelKey: "presentations",
      roles: ["admin", "department_principal", "teacher"],
      permissions: [PERMISSIONS.MANAGE_PRESENTATIONS],
      feature: "presentationBuilder",
      section: "teaching",
    },
    {
      path: "/portal/worksheets",
      icon: HiOutlineDocumentCheck,
      labelKey: "worksheetChecker",
      roles: ["admin", "teacher"],
      feature: "worksheetChecker",
      section: "teaching",
    },
    {
      path: "/portal/newsletters/admin",
      icon: HiOutlineDocumentCheck,
      labelKey: "newslettersReview",
      admin: true,
      feature: "newsletterCommunication",
      section: "communication",
    },
    {
      path: "/portal/newsletters/history",
      icon: HiOutlineNewspaper,
      labelKey: "newsletters",
      roles: ["parent"],
      feature: "newsletterCommunication",
      section: "communication",
    },
    {
      path: "/portal/sbr/config",
      icon: HiOutlineAdjustmentsHorizontal,
      labelKey: "sbrConfig",
      roles: ["admin"],
      permissions: [PERMISSIONS.MANAGE_SBR_SCALES],
      section: "admin",
    },
    {
      path: "/portal/sbr",
      icon: HiOutlineDocumentChartBar,
      labelKey: "sbrReports",
      roles: ["admin", "teacher", "parent"],
      permissions: [PERMISSIONS.GENERATE_SBR_REPORTS, PERMISSIONS.VIEW_SBR_REPORTS],
      section: "assessment",
    },
    {
      path: "/portal/schedules",
      icon: HiOutlineCalendar,
      labelKey: "scheduleManagement",
      roles: ["admin"],
      section: "operations",
    },
    {
      path: "/portal/timetable",
      icon: HiOutlineClock,
      labelKey: "timetable",
      roles: ["admin", "teacher", "department_principal"],
      section: "operations",
    },
    {
      path: "/portal/school-calendar",
      icon: HiOutlineCalendarDays,
      labelKey: "schoolCalendar",
      roles: ["admin", "department_principal", "teacher"],
      permissions: [PERMISSIONS.MANAGE_EVENTS],
      section: "operations",
    },
    {
      path: "/portal/attendance",
      icon: HiOutlineUsers,
      labelKey: "attendance",
      roles: ["admin", "department_principal"],
      section: "operations",
    },
    {
      path: "/portal/attendance-requests",
      icon: HiOutlineInboxArrowDown,
      labelKey: "attendanceRequests",
      roles: ["admin", "department_principal", "teacher", "parent", "student"],
      section: "operations",
    },
    {
      path: "/portal/review-attendance-requests",
      icon: HiOutlineTicket,
      labelKey: "attendanceTickets",
      roles: ["admin", "department_principal"],
      section: "operations",
    },
    {
      path: "/portal/attendance-reminders",
      icon: HiOutlineMegaphone,
      labelKey: "attendanceReminders",
      roles: ["admin"],
      section: "operations",
    },
    {
      path: "/portal/substitutions",
      icon: HiOutlineUserPlus,
      labelKey: "subRequests",
      roles: ["admin", "department_principal", "teacher"],
      section: "operations",
      badgeCount: isTeacher ? (pendingSubCount?.count || 0) : 0,
    },
    {
      path: "/portal/behavior",
      icon: HiOutlineFaceSmile,
      labelKey: "behaviorManagement",
      roles: ["admin", "department_principal", "teacher"],
      permissions: [PERMISSIONS.MANAGE_BEHAVIOR, PERMISSIONS.VIEW_BEHAVIOR],
      section: "support",
    },
    {
      path: "/portal/behavior-analytics",
      icon: HiOutlineChartPie,
      labelKey: "behaviorAnalytics",
      roles: ["admin", "department_principal", "super_admin"],
      section: "support",
    },
    {
      path: "/portal/teachers",
      icon: HiOutlineIdentification,
      labelKey: "teachers",
      roles: ["admin", "department_principal"],
      section: "admin",
    },
    {
      path: "/portal/subjects",
      icon: HiOutlineTag,
      labelKey: "subjects",
      roles: ["teacher"],
      section: "teaching",
    },
    // {
    //   path: "/portal/reading/texts",
    //   icon: HiOutlineRectangleStack,
    //   labelKey: "reading",
    //   roles: ["admin", "teacher"],
    //   feature: "readingAssistant",
    //   section: "teaching",
    // },
    {
      path: "/portal/school-settings",
      icon: HiOutlineBuildingOffice,
      labelKey: "schoolSettings",
      admin: true,
      section: "admin",
    },
    {
      path: "/portal/user-management",
      icon: HiOutlineUsers,
      labelKey: "userManagement",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.MANAGE_USERS],
      section: "admin",
    },
    {
      path: "/portal/settings/subscription",
      icon: HiOutlineCreditCard,
      labelKey: "subscription",
      admin: true,
      section: "admin",
    },
    {
      path: "/portal/api-docs",
      icon: HiOutlineCommandLine,
      labelKey: "apiDocumentation",
      admin: true,
      feature: "apiAccess",
      section: "admin",
    },
    {
      path: "/portal/my-grades",
      icon: HiOutlineAcademicCap,
      labelKey: "myGrades",
      roles: ["student"],
      section: "assessment",
    },
    // Social Studies — student
    {
      path: "/portal/social-studies/student",
      icon: HiOutlineBookOpen,
      labelKey: "socialStudiesStudent",
      roles: ["student"],
      feature: "socialStudies",
      section: "assessment",
    },
    {
      path: "/portal/my-assignments",
      icon: HiOutlinePencilSquare,
      labelKey: "assignments",
      roles: ["student"],
      section: "assessment",
    },
    {
      path: "/portal/student-attendance",
      icon: HiOutlineClipboardDocumentCheck,
      labelKey: "myAttendance",
      roles: ["student"],
      section: "operations",
    },
    {
      path: "/portal/practice",
      icon: HiOutlineSparkles,
      labelKey: "practice",
      roles: ["student"],
      section: "assessment",
    },
    {
      path: "/portal/practice/sb-results",
      icon: HiOutlineCheckCircle,
      labelKey: "sbResults",
      roles: ["student"],
      section: "assessment",
    },
    {
      path: "/portal/academic-excellence",
      icon: HiOutlineStar,
      labelKey: "academicExcellence",
      roles: ["student"],
      feature: "academicIntelligence",
      section: "insights",
    },
    // {
    //   path: "/portal/reading",
    //   icon: HiOutlineRectangleStack,
    //   labelKey: "reading",
    //   roles: ["student"],
    //   feature: "readingAssistant",
    //   section: "teaching",
    // },
    {
      path: "/portal/revision",
      icon: HiOutlineArrowPath,
      labelKey: "revisionPlans",
      roles: ["student", "teacher", "admin"],
      feature: "revisionPlanning",
      section: "support",
    },
    {
      path: "/portal/finance",
      icon: HiOutlineBanknotes,
      labelKey: "financeDashboard",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_FEE_STRUCTURES, PERMISSIONS.VIEW_INVOICES, PERMISSIONS.VIEW_FINANCE_REPORTS],
      section: "finance",
      end: true,
    },
    {
      path: "/portal/finance/fee-structures",
      icon: HiOutlineCalculator,
      labelKey: "feeStructures",
      roles: ["admin"],
      permissions: [PERMISSIONS.MANAGE_FEE_STRUCTURES, PERMISSIONS.VIEW_FEE_STRUCTURES],
      section: "finance",
    },
    {
      path: "/portal/finance/discounts",
      icon: HiOutlineReceiptPercent,
      labelKey: "discounts",
      roles: ["admin"],
      permissions: [PERMISSIONS.MANAGE_DISCOUNTS],
      section: "finance",
    },
    {
      path: "/portal/finance/invoices",
      icon: HiOutlineDocumentCurrencyDollar,
      labelKey: "invoices",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_INVOICES, PERMISSIONS.CREATE_INVOICES],
      section: "finance",
    },
    {
      path: "/portal/finance/payments",
      icon: HiOutlineCreditCard,
      labelKey: "payments",
      roles: ["admin"],
      permissions: [PERMISSIONS.RECORD_PAYMENTS],
      section: "finance",
    },
    {
      path: "/portal/finance/reports",
      icon: HiOutlineChartBar,
      labelKey: "financeReports",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_FINANCE_REPORTS],
      section: "finance",
    },
    /*
    // ── HR & Staff Management ──    {
      path: "/portal/hr",
      icon: HiOutlineUserGroup,
      labelKey: "hrDashboard",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_STAFF_PROFILES],
      section: "hr",
    },
    {
      path: "/portal/hr/staff",
      icon: HiOutlineIdentification,
      labelKey: "staffDirectory",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_STAFF_PROFILES],
      section: "hr",
    },
    {
      path: "/portal/hr/leave",
      icon: HiOutlineCalendarDays,
      labelKey: "leaveManagement",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.APPROVE_LEAVE],
      section: "hr",
    },
    {
      path: "/portal/hr/leave-settings",
      icon: HiOutlineAdjustmentsHorizontal,
      labelKey: "leaveSettings",
      roles: ["admin"],
      permissions: [PERMISSIONS.MANAGE_LEAVE_TYPES],
      section: "hr",
    },
    {
      path: "/portal/hr/certifications",
      icon: HiOutlineAcademicCap,
      labelKey: "certifications",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_CERTIFICATIONS],
      section: "hr",
    },
    {
      path: "/portal/hr/reviews",
      icon: HiOutlineClipboardDocumentCheck,
      labelKey: "performanceReviews",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.MANAGE_PERFORMANCE_REVIEWS],
      section: "hr",
    },
    {
      path: "/portal/hr/pd",
      icon: HiOutlineBookOpen,
      labelKey: "professionalDevelopment",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_PD_REPORTS],
      section: "hr",
    },
    {
      path: "/portal/hr/my",
      icon: HiOutlineBriefcase,
      labelKey: "myHRProfile",
      roles: ["admin", "teacher", "department_principal", "staff"],
      permissions: [PERMISSIONS.VIEW_OWN_HR_PROFILE],
      section: "hr",
    },
    {
      path: "/portal/hr/settings",
      icon: HiOutlineCog6Tooth,
      labelKey: "hrSettings",
      roles: ["admin"],
      permissions: [PERMISSIONS.MANAGE_HR_SETTINGS],
      section: "hr",
    },
    */
    // ── PLP – Character Development ──
    {
      path: "/portal/plp",
      icon: HiOutlinePLP,
      labelKey: "plp",
      roles: ["admin", "teacher", "department_principal"],
      section: "plp",
      end: true,
    },
    {
      path: "/portal/plp/awards",
      icon: HiOutlineTrophy,
      labelKey: "plpAwards",
      roles: ["admin", "teacher"],
      section: "plp",
    },
    {
      path: "/portal/plp/supervisor",
      icon: HiOutlineUserGroup,
      labelKey: "plpSupervisor",
      roles: ["admin", "department_principal"],
      section: "plp",
    },
    {
      path: "/portal/plp/config",
      icon: HiOutlinePLPConfig,
      labelKey: "plpConfig",
      roles: ["admin"],
      section: "plp",
    },
    {
      path: "/portal/plp/supervisor-assignments",
      icon: HiOutlineIdentification,
      labelKey: "plpSupervisorAssignments",
      roles: ["admin"],
      section: "plp",
    },
    {
      path: "/portal/settings",
      icon: HiOutlineCog6Tooth,
      labelKey: "settings",
      section: "account",
    },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if ((item.section || "overview") === "finance") {
      return false;
    }

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
            isRtl ? (
              <HiOutlineChevronRight size={20} />
            ) : (
              <HiOutlineChevronLeft size={20} />
            )
          ) : (
            <HiOutlineBars3 size={24} />
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
